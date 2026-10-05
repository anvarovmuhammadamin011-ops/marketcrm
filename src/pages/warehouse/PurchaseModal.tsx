import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import { ErrorBox } from '../../components/ui/Modal'
import { fmtMoney, fmtQty, fromDateInput, toDateInput } from '../../db/repo/helpers'
import { listProducts, type ProductRow } from '../../db/repo/productsRepo'
import { getOpenShift } from '../../db/repo/salesRepo'
import { createPurchase, createSupplier, listSuppliers } from '../../db/repo/stockRepo'
import type { Shift } from '../../types'

interface Props {
  open: boolean
  userId: number
  onClose: () => void
}

/** Kirim qatori */
interface Line {
  key: number
  productId: number
  qty: string
  costPrice: string
  expiry: string // '' = muddatsiz (YYYY-MM-DD)
}

let lineKey = 1

/** OMBOR — YANGI KIRIM shakli */
export default function PurchaseModal({ open, userId, onClose }: Props) {
  const products = useLiveQuery(() => listProducts(), [open], [] as ProductRow[])
  const suppliers = useLiveQuery(() => listSuppliers(), [open], [])
  const shift = useLiveQuery<Shift | null, Shift | null>(
    () => (open ? getOpenShift() : Promise.resolve(null)),
    [open],
    null,
  )

  const [supplierId, setSupplierId] = useState(0)
  const [newSupplier, setNewSupplier] = useState('')
  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [date, setDate] = useState(toDateInput(Date.now()))
  const [paid, setPaid] = useState('')
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('cash')
  const [paidFromCash, setPaidFromCash] = useState(true)
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Ocha qayta tozalash
  useEffect(() => {
    if (!open) return
    setError('')
    setSupplierId(0)
    setShowNewSupplier(false)
    setNewSupplier('')
    setDate(toDateInput(Date.now()))
    setPaid('')
    setPayMethod('cash')
    setPaidFromCash(true)
    setNote('')
    setLines([
      { key: lineKey++, productId: 0, qty: '', costPrice: '', expiry: '' },
    ])
  }, [open])

  if (!open) return null

  function addLine() {
    setLines((prev) => [...prev, { key: lineKey++, productId: 0, qty: '', costPrice: '', expiry: '' }])
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  /** Mahsulot tanlansa — kirim narxini avtomatik taklif qilish */
  function handleProductChange(key: number, productId: number) {
    const product = products.find((p) => p.id === productId)
    updateLine(key, {
      productId,
      costPrice: product ? String(product.costPrice) : '',
    })
  }

  const total = lines.reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.costPrice) || 0),
    0,
  )
  const qarz = total - (Number(paid) || 0)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)

    try {
      // ── Yetkazib beruvchi: yangisi kiritilgan bo'lsa avval yaratamiz ──
      let sid = supplierId
      if (showNewSupplier) {
        if (!newSupplier.trim()) throw new Error("Yetkazib beruvchi nomini kiriting")
        sid = await createSupplier({ nom: newSupplier.trim() })
      }
      if (!sid) throw new Error('Yetkazib beruvchini tanlang')

      // ── Qatorlarni tekshirish ──
      const payload = lines
        .filter((l) => l.productId > 0 && Number(l.qty) > 0)
        .map((l) => ({
          productId: l.productId,
          qty: Number(l.qty),
          costPrice: Number(l.costPrice) || 0,
          expiryDate: l.expiry ? fromDateInput(l.expiry) : null,
        }))

      if (payload.length === 0) {
        throw new Error('Kamida bitta qatorni to\'ldiring (mahsulot + miqdor)')
      }

      await createPurchase({
        supplierId: sid,
        date: fromDateInput(date),
        lines: payload,
        paid: Number(paid) || 0,
        payMethod,
        paidFromCash: payMethod === 'cash' && paidFromCash,
        shiftId: shift?.id ?? null,
        userId,
        note: note.trim() || undefined,
      })

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        className="card my-6 w-full max-w-4xl p-6 shadow-xl"
      >
        <h2 className="mb-4 border-b border-slate-100 pb-3 text-lg font-bold text-slate-800">
          Yangi kirim (tovar kiritish)
        </h2>

        {/* ── Shapka ── */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Yetkazib beruvchi *
            </label>
            {showNewSupplier ? (
              <div className="flex gap-2">
                <input
                  className="fld"
                  placeholder="Yangi yetkazib beruvchi nomi"
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn-ghost whitespace-nowrap"
                  onClick={() => {
                    setShowNewSupplier(false)
                    setNewSupplier('')
                  }}
                >
                  Bekor
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  className="fld"
                  value={supplierId || ''}
                  onChange={(e) => setSupplierId(Number(e.target.value))}
                >
                  <option value="">— tanlang —</option>
                  {(suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-ghost whitespace-nowrap"
                  onClick={() => setShowNewSupplier(true)}
                >
                  + Yangi
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Kirim sanasi</label>
            <input
              className="fld"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* ── Qatorlar ── */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-3 py-2.5">Mahsulot</th>
                <th className="w-28 px-3 py-2.5 text-right">Miqdor</th>
                <th className="w-36 px-3 py-2.5 text-right">Kirim narxi</th>
                <th className="w-40 px-3 py-2.5">Yaroqlilik muddati</th>
                <th className="w-32 px-3 py-2.5 text-right">Jami</th>
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const lineTotal = (Number(l.qty) || 0) * (Number(l.costPrice) || 0)
                return (
                  <tr key={l.key} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <select
                        className="fld"
                        value={l.productId || ''}
                        onChange={(e) => handleProductChange(l.key, Number(e.target.value))}
                      >
                        <option value="">— tanlang —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nom} — {p.barcode}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="fld text-right"
                        type="number"
                        min="0"
                        step="any"
                        value={l.qty}
                        onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="fld text-right"
                        type="number"
                        min="0"
                        step="1"
                        value={l.costPrice}
                        onChange={(e) => updateLine(l.key, { costPrice: e.target.value })}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="fld"
                        type="date"
                        value={l.expiry}
                        onChange={(e) => updateLine(l.key, { expiry: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700">
                      {fmtMoney(lineTotal)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(l.key)}
                        title="Qatorni o'chirish"
                        className="rounded px-2 py-1 text-rose-500 hover:bg-rose-50"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <button type="button" onClick={addLine} className="btn-ghost mt-2 text-xs">
          + Qator qo'shish
        </button>

        {/* ── Pastki qismi: hisob ── */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              To'langan summa (so'm)
            </label>
            <input
              className="fld"
              type="number"
              min="0"
              max={Math.floor(total)}
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              placeholder="0"
            />
            {(Number(paid) || 0) > total && (
              <p className="mt-1 text-xs text-rose-600">Kirim summasidan ko'p to'lab bo'lmaydi</p>
            )}
            <div className="mt-2 flex gap-1.5">
              {(
                [
                  ['cash', 'Naqd'],
                  ['card', 'Karta'],
                ] as Array<['cash' | 'card', string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPayMethod(key)}
                  className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                    payMethod === key
                      ? 'border-teal-600 bg-teal-50 text-teal-700'
                      : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPaid(String(Math.floor(qarz)))}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-500 hover:bg-slate-50"
              >
                Qarzni to'ldirmaslik
              </button>
            </div>
            {payMethod === 'cash' && Number(paid) > 0 && (
              <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={paidFromCash}
                  onChange={(e) => setPaidFromCash(e.target.checked)}
                />
                <span>
                  Kassadan naqd berilmoqda (smenadan chiqadi)
                  {!shift && (
                    <span className="mt-0.5 block text-rose-600">
                      Ochiq smena yo'q — belgilanmasa to'lov kassadan tashqarida hisoblanadi
                    </span>
                  )}
                  {shift && (
                    <span className="mt-0.5 block text-slate-400">
                      Ochiq smena · #{shift.id} · {fmtMoney(shift.openingCash)} so'm boshlang'ich naqd
                    </span>
                  )}
                </span>
              </label>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Izoh</label>
            <input
              className="fld"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ixtiyoriy"
            />
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Kirim jami:</span>
              <b className="text-slate-800">{fmtMoney(total)}</b>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-500">Qarz:</span>
              <b className={qarz > 0 ? 'text-rose-600' : 'text-emerald-600'}>{fmtMoney(qarz)}</b>
            </div>
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>Omborga tushadi:</span>
              <span>
                {fmtQty(
                  lines.reduce((s, l) => s + (Number(l.qty) || 0), 0),
                )}{' '}
                dona
              </span>
            </div>
          </div>
        </div>

        <ErrorBox message={error} />

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="btn-ghost">
            Bekor qilish
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saqlanmoqda…' : 'Kirimni saqlash'}
          </button>
        </div>
      </form>
    </div>
  )
}
