import { db } from '../database'
import { endOfDay, startOfDay, toDateInput } from './helpers'
import { getStockMap } from './stockRepo'
import type { Sale, SaleItem } from '../../types'

/**
 * HISOBOTLAR
 * — foyda, TOP mahsulotlar, kassir kesimidagi natijalar, ombor qiymati.
 *
 * MUHIM QOIDA: hisobotlarda faqat `status = 'completed'` bo'lgan sotuvlar
 * hisobga olinadi (bekor qilingan va vozvrat qilingan cheklar — yo'q).
 */

export interface Period {
  from: number // kun boshi
  to: number // kun oxiri
}

/** "Bugun", "7 kun", "shu oy", "o'tgan oy" kabi tayyor davrlar */
export function presetPeriod(preset: Preset): Period {
  const now = new Date()
  switch (preset) {
    case 'today':
      return { from: startOfDay(now.getTime()), to: endOfDay(now.getTime()) }
    case 'week':
      return { from: startOfDay(now.getTime() - 6 * 86400000), to: endOfDay(now.getTime()) }
    case 'month': {
      const b = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      return { from: b, to: endOfDay(now.getTime()) }
    }
    case 'prevMonth': {
      const b = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
      const t = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime()
      return { from: b, to: t }
    }
    case 'year':
      return {
        from: new Date(now.getFullYear(), 0, 1).getTime(),
        to: endOfDay(now.getTime()),
      }
  }
}

export type Preset = 'today' | 'week' | 'month' | 'prevMonth' | 'year'

export const PRESET_LABELS: Record<Preset, string> = {
  today: 'Bugun',
  week: '7 kun',
  month: 'Shu oy',
  prevMonth: "O'tgan oy",
  year: 'Shu yil',
}

// ────────────────────── ASOSIY FOYDA ──────────────────────

export interface ProfitSummary {
  salesCount: number
  salesTotal: number // jami tushum (chegirmadan keyin)
  discountTotal: number
  costTotal: number // sotilgan tovar tannarxi
  grossProfit: number // salesTotal - costTotal
  expensesTotal: number
  netProfit: number // grossProfit - expensesTotal
  avgCheck: number // o'rtacha chek
  itemsSold: number // sotilgan dona/kg soni
  cashSales: number
  cardSales: number
  returnsTotal: number // vozvrat qilingan cheklarning summasi
  voidCount: number // bekor qilingan cheklar soni
}

function inPeriod(sale: Sale, p: Period): boolean {
  return sale.datetime >= p.from && sale.datetime <= p.to
}

/** Davrdagi asosiy ko'rsatkichlar */
export async function profitSummary(p: Period): Promise<ProfitSummary> {
  const sales = (await db.sales.toArray()).filter((s) => inPeriod(s, p))

  const done = sales.filter((s) => s.status === 'completed')
  const salesTotal = done.reduce((s, x) => s + x.total, 0)
  const discountTotal = done.reduce((s, x) => s + (x.discount ?? 0), 0)
  const costTotal = done.reduce((s, x) => s + (x.costTotal ?? 0), 0)

  const doneIds = done.map((s) => s.id!)
  const items: SaleItem[] =
    doneIds.length > 0 ? await db.sale_items.where('saleId').anyOf(doneIds).toArray() : []

  // To'lovlar turi bo'yicha tushum
  const payments =
    doneIds.length > 0
      ? await db.sale_payments.where('saleId').anyOf(doneIds).toArray()
      : []
  const cashSales = payments.filter((x) => x.method === 'cash').reduce((s, x) => s + x.amount, 0)
  const cardSales = payments.filter((x) => x.method === 'card').reduce((s, x) => s + x.amount, 0)

  // Chiqimlar (sana bo'yicha)
  const expenses = (await db.expenses.toArray()).filter((e) => e.date >= p.from && e.date <= p.to)
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0)

  const returned = sales.filter((s) => s.status === 'returned')
  const grossProfit = salesTotal - costTotal

  return {
    salesCount: done.length,
    salesTotal,
    discountTotal,
    costTotal,
    grossProfit,
    expensesTotal,
    netProfit: grossProfit - expensesTotal,
    avgCheck: done.length > 0 ? Math.round(salesTotal / done.length) : 0,
    itemsSold: items.reduce((s, i) => s + i.qty, 0),
    cashSales,
    cardSales,
    returnsTotal: returned.reduce((s, x) => s + x.total, 0),
    voidCount: sales.filter((s) => s.status === 'void').length,
  }
}

// ────────────────────── KUNLIK QATOR ──────────────────────

export interface DayPoint {
  /** 2026-10-04 */
  day: string
  salesTotal: number
  costTotal: number
  grossProfit: number
  expensesTotal: number
  count: number
}

/** Kunlik tushum va foyda (grafik uchun) */
export async function dailySeries(p: Period): Promise<DayPoint[]> {
  const sales = (await db.sales.toArray()).filter((s) => inPeriod(s, p) && s.status === 'completed')
  const expenses = (await db.expenses.toArray()).filter((e) => e.date >= p.from && e.date <= p.to)

  const map = new Map<string, DayPoint>()
  function slot(ts: number): DayPoint {
    const key = toDateInput(ts)
    let d = map.get(key)
    if (!d) {
      d = { day: key, salesTotal: 0, costTotal: 0, grossProfit: 0, expensesTotal: 0, count: 0 }
      map.set(key, d)
    }
    return d
  }

  for (const s of sales) {
    const d = slot(s.datetime)
    d.salesTotal += s.total
    d.costTotal += s.costTotal ?? 0
    d.grossProfit += s.total - (s.costTotal ?? 0)
    d.count += 1
  }
  for (const e of expenses) slot(e.date).expensesTotal += e.amount

  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
}

// ────────────────────── MAHSULOTLAR ──────────────────────

export interface ProductStat {
  productId: number
  nom: string
  categoryName: string
  qty: number
  total: number // tushum
  profit: number // foyda
}

/** Eng ko'p / eng kam sotilgan mahsulotlar */
export async function productStats(
  p: Period,
  opts: { sort?: 'total' | 'qty'; limit?: number } = {},
): Promise<ProductStat[]> {
  const { sort = 'total', limit = 10 } = opts

  const sales = (await db.sales.toArray()).filter((s) => inPeriod(s, p) && s.status === 'completed')
  if (sales.length === 0) return []

  const items = await db.sale_items.where('saleId').anyOf(sales.map((s) => s.id!)).toArray()
  const products = await db.products.toArray()
  const categories = await db.categories.toArray()

  const prodMap = new Map(products.map((x) => [x.id, x]))
  const catMap = new Map(categories.map((c) => [c.id, c.nom]))

  const map = new Map<number, ProductStat>()
  for (const i of items) {
    const p0 = prodMap.get(i.productId)
    let row = map.get(i.productId)
    if (!row) {
      row = {
        productId: i.productId,
        nom: p0?.nom ?? `#${i.productId}`,
        categoryName: catMap.get(p0?.categoryId ?? 0) ?? '—',
        qty: 0,
        total: 0,
        profit: 0,
      }
      map.set(i.productId, row)
    }
    row.qty += i.qty
    row.total += i.lineTotal
    row.profit += i.lineTotal - i.qty * i.costPrice
  }

  const list = [...map.values()]
  list.sort((a, b) => (sort === 'qty' ? b.qty - a.qty : b.total - a.total))
  return list.slice(0, limit)
}

/** Kam sotilgan mahsulotlar (sotilmaganlari ham ko'rsatadi) */
export async function leastSoldProducts(p: Period, limit = 10): Promise<ProductStat[]> {
  const sales = (await db.sales.toArray()).filter((s) => inPeriod(s, p) && s.status === 'completed')
  const products = (await db.products.toArray()).filter((x) => x.isActive)
  const categories = await db.categories.toArray()
  const catMap = new Map(categories.map((c) => [c.id, c.nom]))

  const map = new Map<number, ProductStat>()
  for (const x of products) {
    map.set(x.id!, {
      productId: x.id!,
      nom: x.nom,
      categoryName: catMap.get(x.categoryId) ?? '—',
      qty: 0,
      total: 0,
      profit: 0,
    })
  }

  if (sales.length > 0) {
    const items = await db.sale_items.where('saleId').anyOf(sales.map((s) => s.id!)).toArray()
    for (const i of items) {
      const row = map.get(i.productId)
      if (!row) continue
      row.qty += i.qty
      row.total += i.lineTotal
      row.profit += i.lineTotal - i.qty * i.costPrice
    }
  }

  return [...map.values()].sort((a, b) => a.qty - b.qty || a.total - b.total).slice(0, limit)
}

// ────────────────────── KATEGORIYA ──────────────────────

export interface CategoryStat {
  categoryId: number
  nom: string
  qty: number
  total: number
  profit: number
  ulush: number // foiz
}

/** Kategoriya kesimidagi tushum */
export async function categoryStats(p: Period): Promise<CategoryStat[]> {
  const sales = (await db.sales.toArray()).filter((s) => inPeriod(s, p) && s.status === 'completed')
  const categories = await db.categories.toArray()
  const products = await db.products.toArray()
  const catMap = new Map(categories.map((c) => [c.id, c.nom]))
  const prodMap = new Map(products.map((x) => [x.id, x]))

  const map = new Map<number, CategoryStat>()
  const ensure = (id: number): CategoryStat => {
    let row = map.get(id)
    if (!row) {
      row = { categoryId: id, nom: catMap.get(id) ?? '—', qty: 0, total: 0, profit: 0, ulush: 0 }
      map.set(id, row)
    }
    return row
  }

  if (sales.length > 0) {
    const items = await db.sale_items.where('saleId').anyOf(sales.map((s) => s.id!)).toArray()
    for (const i of items) {
      const catId = prodMap.get(i.productId)?.categoryId ?? 0
      const row = ensure(catId)
      row.qty += i.qty
      row.total += i.lineTotal
      row.profit += i.lineTotal - i.qty * i.costPrice
    }
  }

  const jami = [...map.values()].reduce((s, r) => s + r.total, 0)
  const list = [...map.values()].sort((a, b) => b.total - a.total)
  for (const r of list) r.ulush = jami > 0 ? Math.round((r.total / jami) * 100) : 0
  return list
}

// ────────────────────── KASSIR ──────────────────────

export interface CashierStat {
  userId: number
  fullName: string
  salesCount: number
  salesTotal: number
  costTotal: number
  profit: number
  avgCheck: number
  ulush: number // foiz
}

/** Kassir bo'yicha hisobot */
export async function cashierStats(p: Period): Promise<CashierStat[]> {
  const sales = (await db.sales.toArray()).filter((s) => inPeriod(s, p) && s.status === 'completed')
  const users = await db.users.toArray()

  const map = new Map<number, CashierStat>()
  for (const u of users) {
    map.set(u.id!, {
      userId: u.id!,
      fullName: u.fullName,
      salesCount: 0,
      salesTotal: 0,
      costTotal: 0,
      profit: 0,
      avgCheck: 0,
      ulush: 0,
    })
  }

  for (const s of sales) {
    let row = map.get(s.userId)
    if (!row) {
      row = {
        userId: s.userId,
        fullName: `#${s.userId}`,
        salesCount: 0,
        salesTotal: 0,
        costTotal: 0,
        profit: 0,
        avgCheck: 0,
        ulush: 0,
      }
      map.set(s.userId, row)
    }
    row.salesCount += 1
    row.salesTotal += s.total
    row.costTotal += s.costTotal ?? 0
    row.profit += s.total - (s.costTotal ?? 0)
  }

  const list = [...map.values()].filter((r) => r.salesCount > 0)
  const jami = list.reduce((s, r) => s + r.salesTotal, 0)
  for (const r of list) {
    r.avgCheck = r.salesCount > 0 ? Math.round(r.salesTotal / r.salesCount) : 0
    r.ulush = jami > 0 ? Math.round((r.salesTotal / jami) * 100) : 0
  }
  return list.sort((a, b) => b.salesTotal - a.salesTotal)
}

// ────────────────────── SMENA ──────────────────────

export interface ShiftStat {
  shiftId: number
  openedAt: number
  salesCount: number
  salesTotal: number
  expectedCash: number
  actualCash: number | null
  diff: number | null
  status: 'open' | 'closed'
}

/** Smenalar kesimida natija */
export async function shiftStats(p: Period): Promise<ShiftStat[]> {
  const shifts = (await db.shifts.toArray()).filter((s) => s.openedAt >= p.from && s.openedAt <= p.to)
  const sales = await db.sales.toArray()

  return shifts
    .map((s) => {
      const own = sales.filter((x) => x.shiftId === s.id && x.status === 'completed')
      return {
        shiftId: s.id!,
        openedAt: s.openedAt,
        salesCount: own.length,
        salesTotal: own.reduce((a, x) => a + x.total, 0),
        expectedCash: s.expectedCash ?? 0,
        actualCash: s.actualCash ?? null,
        diff: s.diff ?? null,
        status: s.status,
      }
    })
    .sort((a, b) => b.openedAt - a.openedAt)
}

// ────────────────────── OMBOR QIYMATI ──────────────────────

export interface StockValue {
  productCount: number
  totalQty: number
  costValue: number // tannarx bo'yicha
  retailValue: number // sotuv narxi bo'yicha
  expectedProfit: number // retail - cost
  lowStockCount: number
  topValue: Array<{ nom: string; qty: number; value: number }>
}

/** Ombordagi tovarning umumiy qiymati */
export async function stockValue(): Promise<StockValue> {
  const [products, stockMap] = await Promise.all([db.products.toArray(), getStockMap()])

  let costValue = 0
  let retailValue = 0
  let totalQty = 0
  let lowStockCount = 0
  const rows: Array<{ nom: string; qty: number; value: number }> = []

  for (const p of products) {
    const qty = Math.max(stockMap.get(p.id!) ?? 0, 0)
    if (qty <= 0) continue
    const value = qty * p.costPrice
    costValue += value
    retailValue += qty * p.salePrice
    totalQty += qty
    if (p.minQty > 0 && qty <= p.minQty) lowStockCount++
    rows.push({ nom: p.nom, qty, value })
  }

  rows.sort((a, b) => b.value - a.value)

  return {
    productCount: rows.length,
    totalQty,
    costValue,
    retailValue,
    expectedProfit: retailValue - costValue,
    lowStockCount,
    topValue: rows.slice(0, 10),
  }
}

// ────────────────────── KIRIM / CHIQIM ──────────────────────

export interface CashFlow {
  purchaseTotal: number
  purchasePaid: number
  purchaseDebt: number
  salesTotal: number
  expensesTotal: number
}

/** Davrdagi kirim va chiqimlar (moliyaviy oqim) */
export async function cashFlow(p: Period): Promise<CashFlow> {
  const purchases = (await db.purchases.toArray()).filter(
    (x) => x.date >= p.from && x.date <= p.to && x.status === 'confirmed',
  )
  const expenses = (await db.expenses.toArray()).filter((e) => e.date >= p.from && e.date <= p.to)
  const sales = (await db.sales.toArray()).filter((s) => inPeriod(s, p) && s.status === 'completed')

  const purchaseTotal = purchases.reduce((s, x) => s + x.total, 0)
  const purchasePaid = purchases.reduce((s, x) => s + x.paid, 0)

  return {
    purchaseTotal,
    purchasePaid,
    purchaseDebt: purchaseTotal - purchasePaid,
    salesTotal: sales.reduce((s, x) => s + x.total, 0),
    expensesTotal: expenses.reduce((s, e) => s + e.amount, 0),
  }
}