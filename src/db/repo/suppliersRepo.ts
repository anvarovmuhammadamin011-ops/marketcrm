import { db } from '../database'
import { logAudit } from './auditRepo'
import type { Purchase, PurchasePayment, Supplier } from '../../types'

/**
 * YETKAZIB BERUVCHILAR va QARZ NAZORATI
 *  — kirimlar bo'yicha statistika (qancha olgan, qancha to'lagan, qarz)
 *  — qarzni yopish (naqd bo'lsa — smena bilan bog'lanadi)
 *
 * QOIDA: `purchases.paid` — jami to'langan. U har bir to'lovda
 * `purchase_payments` yozuvi qo'shilib yangilanadi (tarix saqlanadi).
 */

export interface SupplierRow extends Supplier {
  purchasesCount: number
  totalPurchased: number // barcha kirimlar summasi
  totalPaid: number // jami to'langan
  debt: number // qarz (total − paid)
  lastPurchaseAt: number | null
  productsCount: number // nechta xil mahsulot olgan
}

/** Yetkazib beruvchilar ro'yxati (qarz statistikasi bilan) */
export async function listSupplierStats(): Promise<SupplierRow[]> {
  const [suppliers, purchases, items] = await Promise.all([
    db.suppliers.toArray(),
    db.purchases.toArray(),
    db.purchase_items.toArray(),
  ])

  const stat = new Map<
    number,
    { count: number; total: number; paid: number; last: number; products: Set<number> }
  >()
  for (const p of purchases) {
    const cur = stat.get(p.supplierId) ?? {
      count: 0,
      total: 0,
      paid: 0,
      last: 0,
      products: new Set<number>(),
    }
    cur.count += 1
    cur.total += p.total
    cur.paid += p.paid
    cur.last = Math.max(cur.last, p.date)
    stat.set(p.supplierId, cur)
  }
  // Nima mahsulotlar olganini sanab o'tamiz (qatorlar orqali)
  const purchaseIds = new Set(purchases.map((p) => p.id!))
  for (const i of items) {
    if (!purchaseIds.has(i.purchaseId)) continue
    const owner = purchases.find((p) => p.id === i.purchaseId)!
    const cur = stat.get(owner.supplierId)
    cur?.products.add(i.productId)
  }

  const rows = suppliers.map((s) => {
    const st = stat.get(s.id!)
    return {
      ...s,
      purchasesCount: st?.count ?? 0,
      totalPurchased: st?.total ?? 0,
      totalPaid: st?.paid ?? 0,
      debt: (st?.total ?? 0) - (st?.paid ?? 0),
      lastPurchaseAt: st?.last || null,
      productsCount: st?.products.size ?? 0,
    }
  })

  rows.sort((a, b) => b.debt - a.debt || a.nom.localeCompare(b.nom, 'ru'))
  return rows
}

export interface SupplierInput {
  nom: string
  telefon?: string
  manzil?: string
  izoh?: string
}

/** Yetkazib beruvchini tahrirlash */
export async function updateSupplier(
  id: number,
  input: SupplierInput,
  byUserId: number,
): Promise<void> {
  const nom = input.nom.trim()
  if (!nom) throw new Error("Yetkazib beruvchi nomini kiriting")

  const boshqa = await db.suppliers
    .filter((s) => s.id !== id && s.nom.toLowerCase() === nom.toLowerCase())
    .first()
  if (boshqa) throw new Error('Bunday nomli yetkazib beruvchi allaqachon bor')

  await db.suppliers.update(id, {
    nom,
    telefon: input.telefon?.trim() || '',
    manzil: input.manzil?.trim() || '',
    izoh: input.izoh?.trim() || '',
  })
  await logAudit(byUserId, 'update', 'supplier', `Yetkazib beruvchi yangilandi: ${nom}`, id)
}

/** Yetkazib beruvchini o'chirish (kirimlari bo'lsa — bloklanadi) */
export async function deleteSupplier(id: number, byUserId: number): Promise<void> {
  const supplier = await db.suppliers.get(id)
  if (!supplier) return

  const used = await db.purchases.where('supplierId').equals(id).first()
  if (used) {
    throw new Error("Bu yetkazib beruvchiga bog'langan kirimlar bor — o'chirib bo'lmaydi")
  }
  await db.suppliers.delete(id)
  await logAudit(byUserId, 'delete', 'supplier', `Yetkazib beruvchi o'chirildi: ${supplier.nom}`, id)
}

// ────────────────────── QARZ TO'LASH ──────────────────────

export interface PaymentInput {
  purchaseId: number
  amount: number
  method: 'cash' | 'card'
  /** Naqd kassadan berilmoqchimi (smena bilan bog'lanadi) */
  fromCash?: boolean
  shiftId?: number | null
  date?: number
  userId: number
  note?: string
}

/**
 * Yetkazib beruvchiga to'lash (qarz yopish).
 * Naqd bo'lsa va kassadan berilsa — `cash_out` yoziladi, ya'ni smena
 * kutilayotgan naqdi kamayadi (kassa hisobida xato chiqmasligi uchun).
 */
export async function payPurchase(input: PaymentInput): Promise<number> {
  const amount = Math.round(input.amount)
  if (!(amount > 0)) throw new Error("Summa 0 dan katta bo'lishi kerak")

  const purchase = await db.purchases.get(input.purchaseId)
  if (!purchase) throw new Error('Kirim hujjati topilmadi')

  const qarz = purchase.total - purchase.paid
  if (qarz <= 0) throw new Error('Bu kirimning qarzi yo\'q')
  if (amount > qarz) throw new Error(`Qarz ${qarz.toLocaleString('ru-RU')} so'm dan ko'p to'lab bo'lmaydi`)

  const fromCash = input.fromCash === true
  const shiftId = fromCash ? input.shiftId : null

  if (fromCash) {
    if (!shiftId) throw new Error('Kassadan to\'lash uchun ochiq smena kerak')
    const smena = await db.shifts.get(shiftId)
    if (!smena || smena.status !== 'open') {
      throw new Error('Smena yopilgan — kassadan to\'lash mumkin emas')
    }
  }

  return db.transaction(
    'rw',
    [db.purchases, db.purchase_payments, db.cash_events, db.audit_log],
    async () => {
      const createdAt = Date.now()

      // 1. To'lov yozuvi
      const paymentId = (await db.purchase_payments.add({
        purchaseId: purchase.id!,
        supplierId: purchase.supplierId,
        date: input.date ?? createdAt,
        method: input.method,
        amount,
        fromCash,
        shiftId,
        userId: input.userId,
        createdAt,
        note: input.note,
      })) as number

      // 2. Kirimning to'langan summasi
      await db.purchases.update(purchase.id!, { paid: purchase.paid + amount })

      // 3. Kassadan berilgan bo'lsa — naqd chiqim
      if (fromCash && shiftId) {
        await db.cash_events.add({
          shiftId,
          type: 'cash_out',
          amount,
          reason: `Yetkazib beruvchiga to'landi (${purchase.docNo})`,
          userId: input.userId,
          createdAt,
          refType: 'purchase',
          refId: purchase.id,
        })
      }

      const qoldiq = purchase.total - purchase.paid - amount
      await logAudit(
        input.userId,
        'update',
        'purchase',
        `${purchase.docNo}: ${amount.toLocaleString('ru-RU')} so'm to'landi (qarz ${qoldiq})`,
        purchase.id,
        { paymentId, fromCash, method: input.method },
      )

      return paymentId
    },
  )
}

/** Bitta kirimning to'lovlari */
export async function listPurchasePayments(purchaseId: number): Promise<PurchasePayment[]> {
  return db.purchase_payments.where('purchaseId').equals(purchaseId).toArray()
}

/** Yetkazib beruvchining to'lovlari */
export async function listSupplierPayments(supplierId: number): Promise<PurchasePayment[]> {
  return db.purchase_payments.where('supplierId').equals(supplierId).toArray()
}

export interface PurchaseRow extends Purchase {
  supplierNom: string
  debt: number
}

/** Yetkazib beruvchining kirimlari (qarz bilan) */
export async function listSupplierPurchases(supplierId: number): Promise<PurchaseRow[]> {
  const [purchases, supplier] = await Promise.all([
    db.purchases.where('supplierId').equals(supplierId).toArray(),
    db.suppliers.get(supplierId),
  ])
  return purchases
    .map((p) => ({ ...p, supplierNom: supplier?.nom ?? '—', debt: p.total - p.paid }))
    .sort((a, b) => b.date - a.date)
}

/** Butun do'kon bo'yicha umumiy qarz */
export async function totalDebt(): Promise<{ qarz: number; muddatiOtsin: number }> {
  const purchases = await db.purchases.toArray()
  const qarz = purchases.reduce((s, p) => s + Math.max(p.total - p.paid, 0), 0)
  return { qarz, muddatiOtsin: purchases.filter((p) => p.total > p.paid).length }
}