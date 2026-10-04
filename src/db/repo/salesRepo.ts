import { nextDocNo } from '../counters'
import { db } from '../database'
import { logAudit } from './auditRepo'
import { getStockMap, writeOutMovements } from './stockRepo'
import type { Sale, SaleItem, SalePayment, Shift } from '../../types'

/**
 * KASSA LOGIKASI
 * — smenalar, savdo yozish (atomik tranzaksiya), vozvrat/bekor qilish
 */

// ────────────────────── SMENA ──────────────────────

/** Ochiq smenani topish (yo'q bo'lsa — kassa smenasiz ishlamaydi) */
export async function getOpenShift(): Promise<Shift | null> {
  const shift = await db.shifts.where('status').equals('open').first()
  return shift ?? null
}

/** Smena ochish */
export async function openShift(openingCash: number, userId: number): Promise<number> {
  if (openingCash < 0) throw new Error("Boshlang'ich naqd pul manfiy bo'lishi mumkin emas")
  const open = await getOpenShift()
  if (open) throw new Error('Ochiq smena allaqachon mavjud')

  const id = (await db.shifts.add({
    openedAt: Date.now(),
    openedBy: userId,
    openingCash,
    status: 'open',
  })) as number

  await logAudit(userId, 'create', 'shift', `Smena ochildi (${openingCash} so'm)`, id)
  return id
}

export interface ShiftSummary {
  shiftId: number
  openedAt: number
  openingCash: number
  cashSales: number
  cashReturns: number
  cashIn: number
  cashOut: number
  expenses: number
  expectedCash: number
  actualCash: number | null
  diff: number | null
  salesCount: number
  salesTotal: number
}

/** Smena bo'yicha naqd pul va savdo hisobi */
export async function calcShiftSummary(shiftId: number): Promise<ShiftSummary> {
  const shift = await db.shifts.get(shiftId)
  if (!shift) throw new Error('Smena topilmadi')

  const sales = await db.sales.where('shiftId').equals(shiftId).toArray()
  const completedIds = sales.filter((s) => s.status === 'completed').map((s) => s.id!)
  // Faqat VOZVRT pulni kassadan chiqaradi. Bekor qilingan (void) chek esa
  // umuman hisobga olinmaydi — aks holda naqd summa ikki marta qisqaradi.
  const returnedIds = sales.filter((s) => s.status === 'returned').map((s) => s.id!)
  const allIds = [...completedIds, ...returnedIds]

  const payments: SalePayment[] =
    allIds.length > 0 ? await db.sale_payments.where('saleId').anyOf(allIds).toArray() : []

  let cashSales = 0
  let cashReturns = 0
  for (const p of payments) {
    if (p.method !== 'cash') continue
    if (completedIds.includes(p.saleId)) cashSales += p.amount
    else if (returnedIds.includes(p.saleId)) cashReturns += p.amount
  }

  const events = await db.cash_events.where('shiftId').equals(shiftId).toArray()
  const cashIn = events.filter((e) => e.type === 'cash_in').reduce((s, e) => s + e.amount, 0)
  const cashOut = events.filter((e) => e.type === 'cash_out').reduce((s, e) => s + e.amount, 0)

  const expenses = await db.expenses.where('shiftId').equals(shiftId).toArray()
  const expenseSum = expenses.reduce((s, e) => s + e.amount, 0)

  const expectedCash =
    shift.openingCash + cashSales - cashReturns + cashIn - cashOut - expenseSum

  const completedSales = sales.filter((s) => s.status === 'completed')
  const salesTotal = completedSales.reduce((s, x) => s + x.total, 0)

  return {
    shiftId,
    openedAt: shift.openedAt,
    openingCash: shift.openingCash,
    cashSales,
    cashReturns,
    cashIn,
    cashOut,
    expenses: expenseSum,
    expectedCash,
    actualCash: shift.actualCash ?? null,
    diff: shift.diff ?? null,
    salesCount: completedSales.length,
    salesTotal,
  }
}

/** Smenani yopish — kassir sanagan pul bilan solishtirib, farqni hisoblaydi */
export async function closeShift(actualCash: number, userId: number): Promise<ShiftSummary> {
  const shift = await getOpenShift()
  if (!shift) throw new Error('Ochiq smena yo\'q')

  const summary = await calcShiftSummary(shift.id!)
  const diff = actualCash - summary.expectedCash

  await db.shifts.update(shift.id!, {
    closedAt: Date.now(),
    closedBy: userId,
    expectedCash: summary.expectedCash,
    actualCash,
    diff,
    status: 'closed',
  })

  await logAudit(
    userId,
    'close',
    'shift',
    `Smena yopildi: kutilgan ${summary.expectedCash}, haqiqiy ${actualCash}, farq ${diff}`,
    shift.id!,
  )

  return { ...summary, actualCash, diff }
}

/** Oxirgi yopilgan smenalar (tarix) */
export async function listShifts(limit = 20): Promise<Shift[]> {
  return db.shifts.orderBy('openedAt').reverse().limit(limit).toArray()
}

// ────────────────────── SOTUV ──────────────────────

export interface CartLine {
  productId: number
  qty: number
  unitPrice: number
  lineDiscount?: number // qatordagi chegirma (so'm)
}

export interface PaymentInput {
  method: 'cash' | 'card'
  amount: number
  change?: number // naqd to'lovda qaytim
}

export interface SaleInput {
  lines: CartLine[]
  discount: number // chekning umumiy chegirmasi
  payments: PaymentInput[]
  userId: number
  shiftId: number
  note?: string
}

export interface SaleResult {
  saleId: number
  no: string
  total: number
  costTotal: number
  datetime: number
}

/**
 * Savdoni yakunlash — HAMMASI bitta tranzaksiyada:
 * sale + sale_items + sale_payments + stock_movements(−) + raqam + jurnal.
 * Biror qismi xato bo'lsa — hech narsa yozilmaydi.
 */
export async function commitSale(input: SaleInput): Promise<SaleResult> {
  if (input.lines.length === 0) throw new Error("Savat bo'sh")

  const subtotal = input.lines.reduce(
    (s, l) => s + l.qty * l.unitPrice - (l.lineDiscount ?? 0),
    0,
  )
  const total = Math.round(subtotal - input.discount)

  if (total < 0) throw new Error("Chegirma umumiy summadan katta bo'lishi mumkin emas")
  if (input.payments.length === 0) throw new Error("To'lov turini tanlang")

  const paidSum = Math.round(input.payments.reduce((s, p) => s + p.amount, 0))
  if (Math.abs(paidSum - total) > 1) {
    throw new Error(`To'langan summa (${paidSum}) chek summasiga (${total}) teng bo'lishi kerak`)
  }

  // ── Oldindan qoldiqni tekshirish (tranzaksiyadan tashqarida, aniq xabar uchun) ──
  const productIds = input.lines.map((l) => l.productId)
  const stockMap = await getStockMap(productIds)
  for (const line of input.lines) {
    const available = stockMap.get(line.productId) ?? 0
    if (line.qty > available + 0.0001) {
      const product = await db.products.get(line.productId)
      throw new Error(
        `Qoldiq yetarli emas: "${product?.nom ?? line.productId}" — bor ${available}, kerak ${line.qty}`,
      )
    }
  }

  const saleId = await db.transaction(
    'rw',
    [
      db.sales,
      db.sale_items,
      db.sale_payments,
      db.stock_movements,
      db.batches,
      db.products,
      db.counters,
      db.audit_log,
    ],
    async () => {
      const no = await nextDocNo('sale_no')
      const datetime = Date.now()

      // Yalpi foyda hisobi uchun: sotilgan paytdagi tannarx
      let costTotal = 0
      for (const line of input.lines) {
        const p = await db.products.get(line.productId)
        costTotal += line.qty * (p?.costPrice ?? 0)
      }

      const id = (await db.sales.add({
        no,
        datetime,
        userId: input.userId,
        shiftId: input.shiftId,
        subtotal: Math.round(subtotal),
        discount: Math.round(input.discount),
        total,
        costTotal: Math.round(costTotal),
        status: 'completed',
        note: input.note,
      })) as number

      for (const line of input.lines) {
        const product = await db.products.get(line.productId)
        if (!product) throw new Error('Mahsulot topilmadi')

        // Ombordan yechish (FEFO bo'yicha partiyalardan)
        await writeOutMovements({
          productId: line.productId,
          qty: line.qty,
          type: 'sale',
          refType: 'sale',
          refId: id,
          userId: input.userId,
          costPrice: product.costPrice,
          note: no,
        })

        await db.sale_items.add({
          saleId: id,
          productId: line.productId,
          batchId: null,
          qty: line.qty,
          unitPrice: Math.round(line.unitPrice),
          costPrice: product.costPrice,
          discount: Math.round(line.lineDiscount ?? 0),
          lineTotal: Math.round(line.qty * line.unitPrice - (line.lineDiscount ?? 0)),
        })
      }

      for (const p of input.payments) {
        await db.sale_payments.add({
          saleId: id,
          method: p.method,
          amount: Math.round(p.amount),
          change: p.method === 'cash' ? Math.round(p.change ?? 0) : undefined,
        })
      }

      await logAudit(input.userId, 'create', 'sale', `Sotuv: ${no} — ${total} so'm`, id)

      return id
    },
  )

  const created = await db.sales.get(saleId)
  return {
    saleId,
    no: created?.no ?? '',
    total,
    costTotal: created?.costTotal ?? 0,
    datetime: created?.datetime ?? Date.now(),
  }
}

export interface SaleRow extends Sale {
  kassirNom: string
  itemSoni: number
  /** To'lov turlari (aralash to'lovda 2 ta) */
  payments: SalePayment[]
}

/** Savdo qatorlarini kassir nomi, tovar soni va to'lovlar bilan boyitish */
async function decorateSales(sales: Sale[]): Promise<SaleRow[]> {
  const users = await db.users.toArray()
  const userMap = new Map(users.map((u) => [u.id, u.fullName]))
  const sorted = [...sales].sort((a, b) => b.datetime - a.datetime)

  const ids = sorted.map((s) => s.id!)
  const payments =
    ids.length > 0 ? await db.sale_payments.where('saleId').anyOf(ids).toArray() : []

  const rows: SaleRow[] = []
  for (const s of sorted) {
    const count = await db.sale_items.where('saleId').equals(s.id!).count()
    rows.push({
      ...s,
      kassirNom: userMap.get(s.userId) ?? '—',
      itemSoni: count,
      payments: payments.filter((p) => p.saleId === s.id),
    })
  }
  return rows
}

/** Smenadagi sotuvlar (tarix) */
export async function listShiftSales(shiftId: number): Promise<SaleRow[]> {
  const sales = await db.sales.where('shiftId').equals(shiftId).toArray()
  return decorateSales(sales)
}

/** So'nggi sotuvlar — barcha smenalar bo'yicha (tarix sahifasi uchun) */
export async function listRecentSales(limit = 200): Promise<SaleRow[]> {
  const sales = await db.sales.orderBy('datetime').reverse().limit(limit).toArray()
  return decorateSales(sales)
}

export async function getSaleItems(saleId: number): Promise<
  Array<SaleItem & { productNom: string }>
> {
  const items = await db.sale_items.where('saleId').equals(saleId).toArray()
  const products = await db.products.where('id').anyOf(items.map((i) => i.productId)).toArray()
  const map = new Map(products.map((p) => [p.id, p.nom]))
  return items.map((i) => ({ ...i, productNom: map.get(i.productId) ?? '—' }))
}

/**
 * Sotuvni bekor qilish yoki vozvrat qilish.
 * Ikkalasida ham omborga qaytarish bajariladi — farqi statusda saqlanadi:
 *  - 'void'     → kassir xato qildi (chek bekor qilindi)
 *  - 'returned' → mijoz tovarni qaytardi (vozvrat)
 */
export async function cancelSale(
  saleId: number,
  userId: number,
  mode: 'void' | 'returned',
): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.sales,
      db.stock_movements,
      db.batches,
      db.products,
      db.audit_log,
    ],
    async () => {
      const sale = await db.sales.get(saleId)
      if (!sale) throw new Error('Sotuv topilmadi')
      if (sale.status !== 'completed') {
        throw new Error('Bu sotuv allaqachon bekor qilingan yoki qaytarilgan')
      }

      // Sotuv davomida qaysi partiyalardan yechilgani ledjerda saqlangan
      const movements = await db.stock_movements
        .filter((m) => m.refType === 'sale' && m.refId === saleId)
        .toArray()

      const createdAt = Date.now()
      for (const m of movements) {
        const backQty = Math.abs(m.qty)
        if (m.batchId != null) {
          const batch = await db.batches.get(m.batchId)
          if (batch) {
            await db.batches.update(batch.id!, {
              qty: Number((batch.qty + backQty).toFixed(3)),
              closedAt: null,
            })
          }
        }
        await db.stock_movements.add({
          productId: m.productId,
          batchId: m.batchId,
          type: 'sale_return',
          qty: backQty,
          costPrice: m.costPrice,
          refType: 'sale',
          refId: saleId,
          userId,
          createdAt,
          note: mode === 'void' ? `Bekor: ${sale.no}` : `Vozvrat: ${sale.no}`,
        })
      }

      await db.sales.update(saleId, { status: mode })

      await logAudit(
        userId,
        mode,
        'sale',
        mode === 'void'
          ? `Sotuv bekor qilindi: ${sale.no}`
          : `Vozvrat qilindi: ${sale.no}`,
        saleId,
      )
    },
  )
}
