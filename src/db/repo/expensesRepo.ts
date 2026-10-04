import { db } from '../database'
import { logAudit } from './auditRepo'
import { endOfDay, startOfDay } from './helpers'
import type { CashEvent, Expense, ExpenseCategory } from '../../types'

/**
 * CHIQIMLAR LOGIKASI
 * — xarajatlar (ijara, ish haqi, kommunal, ...) va kassadan naqd harakati.
 *
 * MUHIM: xarajat ikki xil bo'lishi mumkin:
 *   - faqat yozuv (hisobot uchun) → expenses.jadvali
 *   - haqiqatan kassadan pul chiqib ketgan → expenses + cash_events(cash_out)
 * Shu sababli `fromCash` parametri mavjud.
 */

// ────────────────────── KATEGORIYALAR ──────────────────────

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  return db.expense_categories.orderBy('sortOrder').toArray()
}

/** Chiqim turini qo'shish (nom bo'sh bo'lmasligi kafolati bilan) */
export async function createExpenseCategory(nom: string): Promise<number> {
  const clean = nom.trim()
  if (!clean) throw new Error('Kategoriya nomini kiriting')

  const mavjud = await db.expense_categories.where('nom').equalsIgnoreCase(clean).first()
  if (mavjud) throw new Error('Bunday kategoriya allaqachon bor')

  const engOxirgi = await db.expense_categories.orderBy('sortOrder').last()
  return (await db.expense_categories.add({
    nom: clean,
    sortOrder: (engOxirgi?.sortOrder ?? -1) + 1,
  })) as number
}

export async function deleteExpenseCategory(id: number): Promise<void> {
  const ishlatilgan = await db.expenses.where('categoryId').equals(id).count()
  if (ishlatilgan > 0) {
    throw new Error(`Bu kategoriyada ${ishlatilgan} ta chiqim bor — o'chirib bo'lmaydi`)
  }
  await db.expense_categories.delete(id)
}

// ────────────────────── XARAJATLAR ──────────────────────

export interface ExpenseInput {
  categoryId: number
  amount: number
  date: number
  note?: string
  /** Haqiqatan kassadan naqd pul chiqdimi? */
  fromCash?: boolean
  /** fromCash = true bo'lsa, qaysi smenadan chiqariladi */
  shiftId?: number | null
  userId: number
}

export interface ExpenseRow extends Expense {
  categoryNom: string
  userNom: string
}

/** Xarajat qo'shish (ixtiyoriy ravishda kassadan naqd chiqarish bilan) */
export async function createExpense(input: ExpenseInput): Promise<number> {
  if (!(input.amount > 0)) throw new Error("Summa 0 dan katta bo'lishi kerak")
  if (input.amount > 1_000_000_000) throw new Error('Summa juda katta — tekshirib ko\'ring')

  const category = await db.expense_categories.get(input.categoryId)
  if (!category) throw new Error('Chiqim turi topilmadi')

  if (input.fromCash && !input.shiftId) {
    throw new Error('Kassadan chiqarish uchun ochiq smena kerak')
  }

  return db.transaction(
    'rw',
    [db.expenses, db.cash_events, db.expense_categories, db.audit_log],
    async () => {
      const id = (await db.expenses.add({
        date: input.date,
        categoryId: input.categoryId,
        amount: Math.round(input.amount),
        userId: input.userId,
        shiftId: input.fromCash ? (input.shiftId ?? null) : null,
        note: input.note?.trim() || undefined,
      })) as number

      if (input.fromCash && input.shiftId) {
        await db.cash_events.add({
          shiftId: input.shiftId,
          type: 'cash_out',
          amount: Math.round(input.amount),
          reason: category.nom,
          userId: input.userId,
          createdAt: Date.now(),
          refType: 'expense',
          refId: id,
        })
      }

      await logAudit(
        input.userId,
        'create',
        'expense',
        `Chiqim: ${category.nom} — ${Math.round(input.amount)} so'm`,
        id,
      )

      return id
    },
  )
}

/** Xarajarni tahrirlash — pul hajati o'zgargan bo'lsa, kassadagi ta'sir ham yangilanadi */
export async function updateExpense(id: number, input: ExpenseInput): Promise<void> {
  const eski = await db.expenses.get(id)
  if (!eski) throw new Error('Chiqim topilmadi')
  if (!(input.amount > 0)) throw new Error("Summa 0 dan katta bo'lishi kerak")

  const category = await db.expense_categories.get(input.categoryId)
  if (!category) throw new Error('Chiqim turi topilmadi')

  const fromCash = Boolean(input.fromCash && input.shiftId)
  if (fromCash && !input.shiftId) throw new Error('Kassadan chiqarish uchun ochiq smena kerak')

  await db.transaction(
    'rw',
    [db.expenses, db.cash_events, db.audit_log],
    async () => {
      await db.expenses.update(id, {
        date: input.date,
        categoryId: input.categoryId,
        amount: Math.round(input.amount),
        shiftId: fromCash ? (input.shiftId ?? null) : null,
        note: input.note?.trim() || undefined,
      })

      // Avvalgi kassa harakatini olib tashlaymiz va yangisini yozamiz
      await db.cash_events.where('refType').equals('expense').and((e) => e.refId === id).delete()
      if (fromCash && input.shiftId) {
        await db.cash_events.add({
          shiftId: input.shiftId,
          type: 'cash_out',
          amount: Math.round(input.amount),
          reason: category.nom,
          userId: input.userId,
          createdAt: Date.now(),
          refType: 'expense',
          refId: id,
        })
      }

      await logAudit(
        input.userId,
        'update',
        'expense',
        `Chiqim tahrirlandi: ${category.nom} — ${Math.round(input.amount)} so'm`,
        id,
      )
    },
  )
}

export async function deleteExpense(id: number, userId: number): Promise<void> {
  const chiqim = await db.expenses.get(id)
  if (!chiqim) throw new Error('Chiqim topilmadi')

  await db.transaction('rw', [db.expenses, db.cash_events, db.audit_log], async () => {
    // Xarajat kassadan chiqarilgan bo'lsa — naqd harakati ham olib tashlanadi
    await db.cash_events.where('refType').equals('expense').and((e) => e.refId === id).delete()
    await db.expenses.delete(id)
    await logAudit(userId, 'delete', 'expense', `Chiqim o'chirildi (#${id})`, id)
  })
}

export interface ExpenseFilters {
  /** Boshlang'ich sana (timestamp) */
  from?: number
  /** Tugash sanasi (timestamp) */
  to?: number
  categoryId?: number
  userId?: number
  /** Faqat kassadan naqd chiqarilganlar */
  fromCashOnly?: boolean
}

export async function listExpenses(f: ExpenseFilters = {}): Promise<ExpenseRow[]> {
  let rows = await db.expenses.orderBy('date').reverse().toArray()

  if (f.from != null) rows = rows.filter((r) => r.date >= f.from!)
  if (f.to != null) rows = rows.filter((r) => r.date <= f.to!)
  if (f.categoryId != null) rows = rows.filter((r) => r.categoryId === f.categoryId)
  if (f.userId != null) rows = rows.filter((r) => r.userId === f.userId)
  if (f.fromCashOnly) rows = rows.filter((r) => r.shiftId != null)

  const [categories, users] = await Promise.all([
    db.expense_categories.toArray(),
    db.users.toArray(),
  ])
  const catMap = new Map(categories.map((c) => [c.id, c.nom]))
  const userMap = new Map(users.map((u) => [u.id, u.fullName]))

  return rows.map((r) => ({
    ...r,
    categoryNom: catMap.get(r.categoryId) ?? '—',
    userNom: userMap.get(r.userId) ?? '—',
  }))
}

/** Sana oralig'ida umumiy chiqim (kategoriya bo'yicha hisobot uchun) */
export async function sumExpenses(f: ExpenseFilters = {}): Promise<number> {
  const rows = await listExpenses(f)
  return rows.reduce((s, r) => s + r.amount, 0)
}

/** Sana oralig'i yordamchilari */
export function rangeFromInputs(from: string, to: string): { from: number; to: number } {
  return { from: startOfDay(from ? new Date(from).getTime() : Date.now()),
           to: endOfDay(to ? new Date(to).getTime() : Date.now()) }
}

// ────────────────────── KASSADAN NAQD ──────────────────────

export interface CashEventRow extends CashEvent {
  userNom: string
}

/** Smena davomida kassadan naqd kiritish/chiqarish */
export async function createCashEvent(params: {
  shiftId: number
  type: 'cash_in' | 'cash_out'
  amount: number
  reason: string
  userId: number
}): Promise<number> {
  if (!(params.amount > 0)) throw new Error("Summa 0 dan katta bo'lishi kerak")
  if (!params.reason.trim()) throw new Error('Sababni yozing')

  const smena = await db.shifts.get(params.shiftId)
  if (!smena) throw new Error('Smena topilmadi')
  if (smena.status !== 'open') throw new Error('Smena yopilgan — naqd harakat qilib bo\'lmaydi')

  return (await db.cash_events.add({
    shiftId: params.shiftId,
    type: params.type,
    amount: Math.round(params.amount),
    reason: params.reason.trim(),
    userId: params.userId,
    createdAt: Date.now(),
  })) as number
}

export async function listCashEvents(shiftId: number): Promise<CashEventRow[]> {
  const [events, users] = await Promise.all([
    db.cash_events.where('shiftId').equals(shiftId).toArray(),
    db.users.toArray(),
  ])
  const userMap = new Map(users.map((u) => [u.id, u.fullName]))
  return events
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((e) => ({ ...e, userNom: userMap.get(e.userId) ?? '—' }))
}