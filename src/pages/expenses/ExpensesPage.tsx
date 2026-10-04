import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ErrorBox } from '../../components/ui/Modal'
import { fmtDateTime, fmtMoney, fromDateInput, toDateInput } from '../../db/repo/helpers'
import {
  createCashEvent,
  createExpense,
  createExpenseCategory,
  deleteExpense,
  listCashEvents,
  listExpenseCategories,
  listExpenses,
  updateExpense,
  type ExpenseRow,
} from '../../db/repo/expensesRepo'
import { getOpenShift } from '../../db/repo/salesRepo'
import { useCurrentUser } from '../../hooks/useAuth'

interface Props {
  userId?: number
}

/** CHIQIMLAR — xarajatlar ro'yxati, ularni kiritish va kassadan naqd harakatlari */
export default function ExpensesPage({ userId }: Props) {
  const user = useCurrentUser()
  const uid = userId ?? user?.id
  if (!uid) return null

  const categories = useLiveQuery(() => listExpenseCategories(), [], [])
  const shift = useLiveQuery(() => getOpenShift(), [], null)

  // ── Filtrlar ──
  const bugun = toDateInput(Date.now())
  const oyBoshi = useMemo(() => {
    const d = new Date()
    return toDateInput(new Date(d.getFullYear(), d.getMonth(), 1).getTime())
  }, [])
  const [from, setFrom] = useState(oyBoshi)
  const [to, setTo] = useState(bugun)
  const [categoryId, setCategoryId] = useState<number>(0)
  const [faqatKassa, setFaqatKassa] = useState(false)

  const filter = useMemo(
    () => ({
      from: from ? fromDateInput(from) : undefined,
      to: to ? fromDateInput(to) + 24 * 60 * 60 * 1000 - 1 : undefined,
      categoryId: categoryId || undefined,
      fromCashOnly: faqatKassa,
    }),
    [from, to, categoryId, faqatKassa],
  )

  const rows = useLiveQuery(() => listExpenses(filter), [filter], [] as ExpenseRow[])

  // ── Shakl holatlari ──
  const [editing, setEditing] = useState<ExpenseRow | null>(null)
  const [category, setCategory] = useState(0)
  const [sana, setSana] = useState(bugun)
  const [summa, setSumma] = useState('')
  const [izoh, setIzoh] = useState('')
  const [kassadan, setKassadan] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Yangi qo'shish paytida birinchi kategoriya avtomatik tanlansin
  useEffect(() => {
    if (!editing && category === 0 && categories.length > 0) setCategory(categories[0].id!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  function resetForm() {
    setEditing(null)
    setCategory(categories[0]?.id ?? 0)
    setSana(bugun)
    setSumma('')
    setIzoh('')
    setKassadan(false)
    setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')

    const payload = {
      categoryId: category,
      amount: Number(summa),
      date: fromDateInput(sana),
      note: izoh.trim() || undefined,
      fromCash: kassadan,
      shiftId: kassadan ? (shift?.id ?? null) : null,
      userId: uid,
    }

    setBusy(true)
    try {
      if (editing) await updateExpense(editing.id!, payload)
      else await createExpense(payload)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(row: ExpenseRow) {
    setEditing(row)
    setCategory(row.categoryId)
    setSana(toDateInput(row.date))
    setSumma(String(row.amount))
    setIzoh(row.note ?? '')
    setKassadan(row.shiftId != null)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(row: ExpenseRow) {
    if (!window.confirm(`"${row.categoryNom}" — ${fmtMoney(row.amount)} so'm chiqimi o'chirilsinmi?`))
      return
    try {
      await deleteExpense(row.id!, uid)
      if (editing?.id === row.id) resetForm()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik yuz berdi')
    }
  }

  // ── Hisoblar ──
  const jami = rows.reduce((s, r) => s + r.amount, 0)
  const kassaOrqali = rows.filter((r) => r.shiftId != null).reduce((s, r) => s + r.amount, 0)

  const categoryStats = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.categoryNom, (map.get(r.categoryNom) ?? 0) + r.amount)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Chiqimlar</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ── Chap ustun: shakl ── */}
        <div className="space-y-4 lg:col-span-1">
          <form onSubmit={handleSubmit} className="card p-5">
            <h2 className="mb-4 text-lg font-bold text-slate-800">
              {editing ? 'Chiqimni tahrirlash' : 'Yangi chiqim'}
            </h2>

            <label className="mb-1 block text-sm font-medium text-slate-600">Kategoriya</label>
            <select
              className="fld mb-1"
              value={category}
              onChange={(e) => setCategory(Number(e.target.value))}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
            <NewCategory />

            <label className="mb-1 mt-3 block text-sm font-medium text-slate-600">Sana</label>
            <input
              className="fld"
              type="date"
              value={sana}
              onChange={(e) => setSana(e.target.value)}
            />

            <label className="mb-1 mt-3 block text-sm font-medium text-slate-600">
              Summa (so'm)
            </label>
            <input
              className="fld text-right text-lg font-bold"
              type="number"
              min="0"
              value={summa}
              onChange={(e) => setSumma(e.target.value)}
              placeholder="0"
            />

            <label className="mb-1 mt-3 block text-sm font-medium text-slate-600">Izoh</label>
            <input
              className="fld"
              value={izoh}
              onChange={(e) => setIzoh(e.target.value)}
              placeholder="ixtiyoriy"
            />

            <label
              className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                shift ? 'border-slate-200 bg-slate-50' : 'border-slate-100 bg-slate-50 opacity-60'
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={kassadan}
                disabled={!shift}
                onChange={(e) => setKassadan(e.target.checked)}
              />
              <span>
                <b className="text-slate-700">Kassadan naqd yechildi</b>
                <span className="block text-xs text-slate-500">
                  {shift
                    ? "Belgilansa, xarajat smena 'kutilayotgan naqd' hisobidan ayriladi"
                    : 'Ochiq smena yo\'q — faqat yozuv sifatida kiritiladi'}
                </span>
              </span>
            </label>

            <ErrorBox message={error} />

            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={busy} className="btn-primary flex-1">
                {busy ? 'Saqlanmoqda…' : editing ? 'Saqlash' : 'Qo\'shish'}
              </button>
              {editing && (
                <button type="button" className="btn-ghost" onClick={resetForm}>
                  Bekor
                </button>
              )}
            </div>
          </form>

          {/* ── Kassadan naqd harakatlari ── */}
          <CashPanel shiftId={shift?.id} userId={uid} />
        </div>

        {/* ── O'ng ustun: ro'yxat ── */}
        <div className="space-y-4 lg:col-span-2">
          {/* Filtrlar */}
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">
                Dan
              </label>
              <input
                className="fld w-36"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">
                Gacha
              </label>
              <input
                className="fld w-36"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">
                Kategoriya
              </label>
              <select
                className="fld w-40"
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
              >
                <option value={0}>Barchasi</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={faqatKassa}
                onChange={(e) => setFaqatKassa(e.target.checked)}
              />
              Faqat kassadan
            </label>

            <div className="ml-auto text-right">
              <div className="text-xs uppercase text-slate-400">Jami</div>
              <div className="text-xl font-black text-rose-600">{fmtMoney(jami)} so'm</div>
              {kassaOrqali > 0 && (
                <div className="text-xs text-slate-400">
                  Kassadan: {fmtMoney(kassaOrqali)} so'm
                </div>
              )}
            </div>
          </div>

          {/* Kategoriya bo'yicha taqsimot */}
          {categoryStats.length > 0 && (
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold text-slate-700">Kategoriya bo'yicha</h3>
              <div className="space-y-2">
                {categoryStats.map(([nom, summa]) => {
                  const ulush = jami > 0 ? Math.round((summa / jami) * 100) : 0
                  return (
                    <div key={nom}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-slate-600">{nom}</span>
                        <span className="text-slate-400">
                          {fmtMoney(summa)} so'm · {ulush}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-rose-400"
                          style={{ width: `${Math.max(ulush, 2)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Ro'yxat */}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-3">Sana</th>
                  <th className="px-4 py-3">Kategoriya</th>
                  <th className="px-4 py-3 text-right">Summa</th>
                  <th className="px-4 py-3">Kassa</th>
                  <th className="px-4 py-3">Izoh</th>
                  <th className="px-4 py-3 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      Bu davrda chiqim yo'q
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-600">{toDateInput(r.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.categoryNom}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-rose-600">
                      {fmtMoney(r.amount)}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.shiftId != null ? (
                        <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                          ha
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">yo'q</span>
                      )}
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-2.5 text-slate-500">
                      {r.note || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        onClick={() => startEdit(r)}
                      >
                        Tahrirlash
                      </button>{' '}
                      <button
                        className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                        onClick={() => handleDelete(r)}
                      >
                        O'chirish
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Yangi kategoriya qo'shish (ichki kichik shakl) */
function NewCategory() {
  const [ochiq, setOchiq] = useState(false)
  const [nom, setNom] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await createExpenseCategory(nom)
      setNom('')
      setOchiq(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik')
    }
  }

  if (!ochiq) {
    return (
      <button
        type="button"
        className="text-xs font-semibold text-teal-700 hover:underline"
        onClick={() => setOchiq(true)}
      >
        + yangi kategoriya
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-2 flex items-center gap-2">
      <input
        className="fld"
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Kategoriya nomi"
        autoFocus
      />
      <button type="submit" className="btn-primary !py-1.5 text-xs">
        Qo'shish
      </button>
      <button
        type="button"
        className="btn-ghost !py-1.5 text-xs"
        onClick={() => setOchiq(false)}
      >
        Bekor
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </form>
  )
}

/** Smena davomida kassadan naqd kiritish / chiqarish */
function CashPanel({ shiftId, userId }: { shiftId?: number; userId: number }) {
  const events = useLiveQuery(
    () => (shiftId ? listCashEvents(shiftId) : Promise.resolve([])),
    [shiftId],
    [],
  )

  const [tur, setTur] = useState<'cash_out' | 'cash_in'>('cash_out')
  const [summa, setSumma] = useState('')
  const [sabab, setSabab] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!shiftId) {
    return (
      <div className="card p-5 text-sm text-slate-400">
        Naqd harakatlari uchun smena ochiq bo'lishi kerak.
      </div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await createCashEvent({
        shiftId: shiftId!,
        type: tur,
        amount: Number(summa),
        reason: sabab,
        userId,
      })
      setSumma('')
      setSabab('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi')
    } finally {
      setBusy(false)
    }
  }

  const kirish = events.filter((e) => e.type === 'cash_in').reduce((s, e) => s + e.amount, 0)
  const chiqish = events.filter((e) => e.type === 'cash_out').reduce((s, e) => s + e.amount, 0)

  return (
    <div className="card p-5">
      <h3 className="mb-1 text-lg font-bold text-slate-800">Kassadan naqd harakati</h3>
      <p className="mb-3 text-xs text-slate-400">
        Kiritilgan: <b className="text-emerald-600">{fmtMoney(kirish)}</b> · Chiqarilgan:{' '}
        <b className="text-rose-600">{fmtMoney(chiqish)}</b>
      </p>

      <form onSubmit={submit}>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTur('cash_out')}
            className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
              tur === 'cash_out'
                ? 'border-rose-500 bg-rose-500 text-white'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Chiqarish
          </button>
          <button
            type="button"
            onClick={() => setTur('cash_in')}
            className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
              tur === 'cash_in'
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Kiritish
          </button>
        </div>

        <input
          className="fld mb-2 text-right"
          type="number"
          min="0"
          value={summa}
          onChange={(e) => setSumma(e.target.value)}
          placeholder="Summa (so'm)"
        />
        <input
          className="fld"
          value={sabab}
          onChange={(e) => setSabab(e.target.value)}
          placeholder="Sabab (masalan: tushumga kirim qilish)"
        />

        <ErrorBox message={error} />

        <button type="submit" disabled={busy} className="btn-primary mt-3 w-full">
          {busy ? 'Yozilmoqda…' : 'Yozish'}
        </button>
      </form>

      {events.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
          {events.slice(0, 8).map((e) => (
            <div key={e.id} className="flex items-center justify-between text-xs">
              <span className="truncate text-slate-500">
                {fmtDateTime(e.createdAt)} · {e.reason}
              </span>
              <b className={e.type === 'cash_in' ? 'text-emerald-600' : 'text-rose-600'}>
                {e.type === 'cash_in' ? '+' : '−'}
                {fmtMoney(e.amount)}
              </b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}