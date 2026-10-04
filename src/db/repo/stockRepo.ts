import { nextDocNo } from '../counters'
import { db } from '../database'
import type {
  Inventory,
  InventoryItem,
  Purchase,
  PurchaseItem,
  StockMovement,
  Supplier,
  Writeoff,
  WriteoffItem,
} from '../../types'
import { logAudit } from './auditRepo'

/**
 * OMBOR LOGIKASI
 *
 * Asosiy qoida: qoldiq hech qayerda "yozilmaydi" —
 * u `stock_movements` jurnalidan SUM(qty) sifatida hisoblanadi.
 * Shunday qilib tarix to'liq saqlanadi va xatolarni topish oson.
 */

// ────────────────────── QOLDIQ ──────────────────────

/**
 * Mahsulotlar bo'yicha joriy qoldiqni olish.
 * `ids` berilsa — faqat shu mahsulotlar (index orqali tez),
 * aks holda — barchasi (kassir uchun butun katalog bir o'tishda olinadi).
 */
export async function getStockMap(ids?: number[]): Promise<Map<number, number>> {
  const rows =
    ids && ids.length > 0
      ? await db.stock_movements.where('productId').anyOf(ids).toArray()
      : await db.stock_movements.toArray()

  const map = new Map<number, number>()
  for (const row of rows) {
    map.set(row.productId, (map.get(row.productId) ?? 0) + row.qty)
  }
  return map
}

/** Bitta mahsulotning qoldig'i */
export async function getStock(productId: number): Promise<number> {
  const map = await getStockMap([productId])
  return map.get(productId) ?? 0
}

/** Partiyalardagi qoldiqlar (batchId → soni) */
export async function getBatchStockMap(batchIds: number[]): Promise<Map<number, number>> {
  if (batchIds.length === 0) return new Map()
  const rows = await db.batches.where('id').anyOf(batchIds).toArray()
  return new Map(rows.map((b) => [b.id!, b.qty]))
}

/**
 * FEFO (First-Expired-First-Out): muddati eng yaqin partiyadan yechish.
 * Muddati bo'lmagan (null) partiyalar oxirida turadi.
 *
 * @returns yechilgan qismlar — har biri uchun movement yoziladi
 */
export async function consumeBatches(
  productId: number,
  qty: number,
): Promise<Array<{ batchId: number | null; qty: number }>> {
  const batches = await db.batches
    .where('productId')
    .equals(productId)
    .filter((b) => b.qty > 0)
    .toArray()

  // Sort: avval muddati yaqin, keyin kiritilgan sana
  batches.sort((a, b) => {
    const ea = a.expiryDate ?? Number.MAX_SAFE_INTEGER
    const eb = b.expiryDate ?? Number.MAX_SAFE_INTEGER
    if (ea !== eb) return ea - eb
    return (a.receivedAt ?? 0) - (b.receivedAt ?? 0)
  })

  const parts: Array<{ batchId: number | null; qty: number }> = []
  let rest = qty

  for (const batch of batches) {
    if (rest <= 0) break
    const take = Math.min(rest, batch.qty)
    const newQty = Number((batch.qty - take).toFixed(3))
    await db.batches.update(batch.id!, {
      qty: newQty,
      closedAt: newQty === 0 ? Date.now() : null,
    })
    parts.push({ batchId: batch.id!, qty: take })
    rest = Number((rest - take).toFixed(3))
  }

  // Partiyalar tugaganda — qolgan qism partiyasiz yechiladi
  if (rest > 0) parts.push({ batchId: null, qty: rest })

  return parts
}

/**
 * Chiqarish/so'ndirish uchun qoldiqni kamaytirish:
 * FEFO bo'yicha partiyalardan yechadi va har qism uchun movement yozadi.
 */
export async function writeOutMovements(params: {
  productId: number
  qty: number
  type: StockMovement['type']
  refType: string
  refId: number
  userId: number
  costPrice: number
  note?: string
  batchId?: number | null
}): Promise<void> {
  const { productId, qty, type, refType, refId, userId, costPrice, note } = params
  const createdAt = Date.now()

  if (params.batchId !== undefined && params.batchId !== null) {
    // Aniq partiya ko'rsatilgan bo'lsa — faqat o'shadan yechamiz
    const batch = await db.batches.get(params.batchId)
    if (batch && batch.qty > 0) {
      const take = Math.min(qty, batch.qty)
      const newQty = Number((batch.qty - take).toFixed(3))
      await db.batches.update(batch.id!, {
        qty: newQty,
        closedAt: newQty === 0 ? createdAt : null,
      })
      await db.stock_movements.add({
        productId,
        batchId: batch.id!,
        type,
        qty: -take,
        costPrice,
        refType,
        refId,
        userId,
        createdAt,
        note,
      })
      if (take < qty) {
        await db.stock_movements.add({
          productId,
          batchId: null,
          type,
          qty: -(qty - take),
          costPrice,
          refType,
          refId,
          userId,
          createdAt,
          note,
        })
      }
      return
    }
  }

  const parts = await consumeBatches(productId, qty)
  for (const part of parts) {
    await db.stock_movements.add({
      productId,
      batchId: part.batchId,
      type,
      qty: -part.qty,
      costPrice,
      refType,
      refId,
      userId,
      createdAt,
      note,
    })
  }
}

// ────────────────────── KIRIM ──────────────────────

export interface PurchaseLineInput {
  productId: number
  qty: number
  costPrice: number
  expiryDate?: number | null
}

export interface PurchaseInput {
  supplierId: number
  date: number
  lines: PurchaseLineInput[]
  paid: number
  userId: number
  note?: string
}

/**
 * Tovar kirimini qayd etish.
 * Tranzaksiyada bajariladi: hujjat + qatorlar + ledjer + partiya + WAC tannarx.
 */
export async function createPurchase(input: PurchaseInput): Promise<number> {
  if (input.lines.length === 0) throw new Error('Kamida bitta mahsulot qatori kiriting')
  for (const line of input.lines) {
    if (!(line.qty > 0)) throw new Error("Miqdor 0 dan katta bo'lishi kerak")
    if (line.costPrice < 0) throw new Error("Kirim narxi manfiy bo'lishi mumkin emas")
  }

  return db.transaction(
    'rw',
    [
      db.purchases,
      db.purchase_items,
      db.stock_movements,
      db.products,
      db.batches,
      db.counters,
      db.audit_log,
    ],
    async () => {
      const docNo = await nextDocNo('purchase_no')
      const total = input.lines.reduce((s, l) => s + l.qty * l.costPrice, 0)

      const purchaseId = (await db.purchases.add({
        supplierId: input.supplierId,
        date: input.date,
        docNo,
        total: Math.round(total),
        paid: Math.round(input.paid),
        userId: input.userId,
        status: 'confirmed',
        note: input.note,
      })) as number

      const productIds = input.lines.map((l) => l.productId)
      const stockMap = await getStockMap(productIds)
      const createdAt = Date.now()

      for (const line of input.lines) {
        const product = await db.products.get(line.productId)
        if (!product) throw new Error('Mahsulot topilmadi')

        // ── 1. Partiya (yaroqlilik kuzatilsa yoki muddat kiritilsa) ──
        let batchId: number | null = null
        if (product.trackBatch || line.expiryDate) {
          batchId = (await db.batches.add({
            productId: line.productId,
            batchNo: docNo,
            expiryDate: line.expiryDate ?? null,
            qty: line.qty,
            costPrice: line.costPrice,
            supplierId: input.supplierId,
            receivedAt: createdAt,
            closedAt: null,
          })) as number
        }

        // ── 2. Ledjer yozuvi (+qoldiq) ──
        await db.stock_movements.add({
          productId: line.productId,
          batchId,
          type: 'purchase',
          qty: line.qty,
          costPrice: line.costPrice,
          refType: 'purchase',
          refId: purchaseId,
          userId: input.userId,
          createdAt,
          note: docNo,
        })

        // ── 3. Kirim narxini hisobga olgan holda WAC tannarx yangilash ──
        const oldQty = stockMap.get(line.productId) ?? 0
        const effectiveOld = Math.max(oldQty, 0) // salbiy qoldiqni hisobga olmaymiz
        const denom = effectiveOld + line.qty
        const newCost =
          denom > 0
            ? (effectiveOld * product.costPrice + line.qty * line.costPrice) / denom
            : line.costPrice

        await db.products.update(line.productId, {
          costPrice: Math.round(newCost),
          updatedAt: createdAt,
        })

        // ── 4. Kirim qatorini saqlash ──
        await db.purchase_items.add({
          purchaseId,
          productId: line.productId,
          batchId,
          qty: line.qty,
          costPrice: line.costPrice,
          expiryDate: line.expiryDate ?? null,
          lineTotal: Math.round(line.qty * line.costPrice),
        })
      }

      await logAudit(
        input.userId,
        'create',
        'purchase',
        `Kirim qayd etildi: ${docNo} (${fmtTotal(total)})`,
        purchaseId,
      )

      return purchaseId
    },
  )
}

function fmtTotal(n: number): string {
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')
}

/** Kirimlar tarixi (yetkazib beruvchi nomi bilan) */
export async function listPurchases(): Promise<
  Array<Purchase & { supplierNom: string }>
> {
  const [purchases, suppliers] = await Promise.all([
    db.purchases.orderBy('date').reverse().toArray(),
    db.suppliers.toArray(),
  ])
  const supMap = new Map(suppliers.map((s) => [s.id, s.nom]))
  return purchases.map((p) => ({ ...p, supplierNom: supMap.get(p.supplierId) ?? '—' }))
}

/** Bitta kirimning qatorlari */
export async function getPurchaseItems(purchaseId: number): Promise<
  Array<PurchaseItem & { productNom: string }>
> {
  const items = await db.purchase_items.where('purchaseId').equals(purchaseId).toArray()
  const products = await db.products.where('id').anyOf(items.map((i) => i.productId)).toArray()
  const map = new Map(products.map((p) => [p.id, p.nom]))
  return items.map((i) => ({ ...i, productNom: map.get(i.productId) ?? '—' }))
}

// ────────────────────── INVENTARIZATSIYA ──────────────────────

export interface InventoryLineInput {
  productId: number
  actualQty: number
  reason?: string
}

export interface InventoryInput {
  date: number
  lines: InventoryLineInput[]
  userId: number
  note?: string
}

/**
 * Inventarizatsiyani tasdiqlash: haqiqiy son tizimdagi sondan farq qilsa,
 * farq miqdorida `adjustment` harakati yoziladi va qoldiq tenglanadi.
 */
export async function confirmInventory(input: InventoryInput): Promise<number> {
  if (input.lines.length === 0) throw new Error("Kamida bitta qator kiriting")

  return db.transaction(
    'rw',
    [
      db.inventories,
      db.inventory_items,
      db.stock_movements,
      db.products,
      db.counters,
      db.audit_log,
    ],
    async () => {
      const docNo = await nextDocNo('inventory_no')
      const inventoryId = (await db.inventories.add({
        date: input.date,
        docNo,
        userId: input.userId,
        status: 'confirmed',
        note: input.note,
      })) as number

      const stockMap = await getStockMap(input.lines.map((l) => l.productId))
      const createdAt = Date.now()
      let farqSoni = 0

      for (const line of input.lines) {
        const systemQty = stockMap.get(line.productId) ?? 0
        const diff = Number((line.actualQty - systemQty).toFixed(3))

        await db.inventory_items.add({
          inventoryId,
          productId: line.productId,
          systemQty,
          actualQty: line.actualQty,
          diff,
          reason: line.reason,
        })

        if (diff !== 0) {
          farqSoni++
          const product = await db.products.get(line.productId)
          await db.stock_movements.add({
            productId: line.productId,
            batchId: null,
            type: 'adjustment',
            qty: diff,
            costPrice: product?.costPrice ?? 0,
            refType: 'inventory',
            refId: inventoryId,
            userId: input.userId,
            createdAt,
            note: line.reason ?? docNo,
          })
        }
      }

      await logAudit(
        input.userId,
        'create',
        'inventory',
        `Inventarizatsiya: ${docNo} (${farqSoni} ta farq)`,
        inventoryId,
      )

      return inventoryId
    },
  )
}

/** Inventarizatsiyalar tarixi */
export async function listInventories(): Promise<Inventory[]> {
  return db.inventories.orderBy('date').reverse().toArray()
}

export async function getInventoryItems(inventoryId: number): Promise<InventoryItem[]> {
  return db.inventory_items.where('inventoryId').equals(inventoryId).toArray()
}

// ────────────────────── HISOBDAN CHIQARISH ──────────────────────

export interface WriteoffLineInput {
  productId: number
  qty: number
  batchId?: number | null
}

export interface WriteoffInput {
  date: number
  reason: Writeoff['reason']
  lines: WriteoffLineInput[]
  userId: number
  note?: string
}

/** Muddati o'tgan / buzilgan / yo'qolgan tovarni hisobdan chiqarish */
export async function createWriteoff(input: WriteoffInput): Promise<number> {
  if (input.lines.length === 0) throw new Error('Kamida bitta mahsulot qatori kiriting')
  for (const line of input.lines) {
    if (!(line.qty > 0)) throw new Error("Miqdor 0 dan katta bo'lishi kerak")
  }

  return db.transaction(
    'rw',
    [db.writeoffs, db.writeoff_items, db.stock_movements, db.batches, db.products, db.counters, db.audit_log],
    async () => {
      const docNo = await nextDocNo('writeoff_no')
      const writeoffId = (await db.writeoffs.add({
        date: input.date,
        docNo,
        reason: input.reason,
        userId: input.userId,
        note: input.note,
      })) as number

      for (const line of input.lines) {
        const product = await db.products.get(line.productId)
        if (!product) throw new Error('Mahsulot topilmadi')

        // Partiyadan (yoki FEFO bo'yicha) yechish va ledjerga yozish
        await writeOutMovements({
          productId: line.productId,
          qty: line.qty,
          type: 'writeoff',
          refType: 'writeoff',
          refId: writeoffId,
          userId: input.userId,
          costPrice: product.costPrice,
          note: docNo,
          batchId: line.batchId ?? undefined,
        })

        await db.writeoff_items.add({
          writeoffId,
          productId: line.productId,
          batchId: line.batchId ?? null,
          qty: line.qty,
          costPrice: product.costPrice,
        })
      }

      await logAudit(
        input.userId,
        'create',
        'writeoff',
        `Hisobdan chiqarildi: ${docNo}`,
        writeoffId,
      )

      return writeoffId
    },
  )
}

export async function listWriteoffs(): Promise<Writeoff[]> {
  return db.writeoffs.orderBy('date').reverse().toArray()
}

export async function getWriteoffItems(writeoffId: number): Promise<WriteoffItem[]> {
  return db.writeoff_items.where('writeoffId').equals(writeoffId).toArray()
}

// ────────────────────── YETKAZIB BERUVCHILAR ──────────────────────

export async function listSuppliers(): Promise<Supplier[]> {
  return db.suppliers.orderBy('nom').toArray()
}

export async function createSupplier(data: Omit<Supplier, 'id'>): Promise<number> {
  const nom = data.nom.trim()
  if (!nom) throw new Error("Yetkazib beruvchi nomini kiriting")
  const exists = await db.suppliers.where('nom').equals(nom).first()
  if (exists) throw new Error('Bunday nomli yetkazib beruvchi allaqachon bor')
  return db.suppliers.add({ ...data, nom }) as Promise<number>
}

export async function deleteSupplier(id: number): Promise<void> {
  const used = await db.purchases.where('supplierId').equals(id).first()
  if (used) {
    throw new Error("Bu yetkazib beruvchiga bog'langan kirimlar bor — o'chirib bo'lmaydi")
  }
  await db.suppliers.delete(id)
}
