import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import { ErrorBox } from '../../components/ui/Modal'
import { fmtDateTime, fmtMoney, fmtQty } from '../../db/repo/helpers'
import { listProducts, type ProductRow } from '../../db/repo/productsRepo'
import { createWriteoff, listWriteoffs } from '../../db/repo/stockRepo'
import type { Writeoff } from '../../types'

interface Props {
  userId: number
}

interface Line {
  key: number
  productId: number
  qty: string
}

const REASONS: Array<{ value: Writeoff['reason']; nom: string }> = [
  { value: 'expired', nom: 'Muddati o\'tdi' },
  { value: 'damaged', nom: 'Buzildi / yaroqsiz' },
  { value: 'lost', nom: 'Yo\'qolgan' },
  { value: 'other', nom: 'Boshqa' },
]

let lineKey = 1

/** OMBOR — HISOBDAN CHIQARISH */
export default function WriteoffPage({ userId }: Props) {
  const products = useLiveQuery(() => listProducts(), [], [] as ProductRow[])
  const history = useLiveQuery(() => listWriteoffs(), [], [])

  const [reason, setReason] = useState<Writeoff['reason']>('expired')
  const [lines, setLines] = useState<Line[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLines([{ key: lineKey++, productId: 0, qty: '' }])
    setNote('')
    setError('')
  }, [])

  function addLine() {
    setLines((p) => [...p, { key: lineKey++, productId: 0, qty: '' }])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const payload = lines
        .filter((l) => l.productId > 0 && Number(l.qty) > 0)
        .map((l) => ({ productId: l.productId, qty: Number(l.qty) }))

      if (payload.length === 0) throw new Error("Kamida bitta qatorni to'ldiring")

      await createWriteoff({
        date: Date.now(),
        reason,
        lines: payload,
        userId,
        note: note.trim() || undefined,
      })

      // Muvaffaqiyatdan so'ng formani tozalash
      setLines([{ key: lineKey++, productId: 0, qty: '' }])
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi')
    } finally {
      setBusy(false)
    }
  }

  const jamiZarar = lines.reduce((s, l) => {
    const p = products.find((x) => x.id === l.productId)
    return s + (Number(l.qty) || 0) * (p?.costPrice ?? 0)
  }, 0)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* ── Chap: shakl ── */}
      <form onSubmit={handleSubmit} className="card p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">Hisobdan chiqarish</h2>

        <label className="mb-1 block text-sm font-medium text-slate-600">Sabab</label>
        <select
          className="fld mb-4"
          value={reason}
          onChange={(e) => setReason(e.target.value as Writeoff['reason'])}
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.nom}
            </option>
          ))}
        </select>

        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.key} className="flex gap-2">
              <select
                className="fld"
                value={l.productId || ''}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((x) =>
                      x.key === l.key ? { ...x, productId: Number(e.target.value) } : x,
                    ),
                  )
                }
              >
                <option value="">— mahsulot —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} (qoldiq: {fmtQty(p.stock)})
                  </option>
                ))}
              </select>
              <input
                className="fld w-28 text-right"
                type="number"
                min="0"
                step="any"
                placeholder="soni"
                value={l.qty}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)),
                  )
                }
              />
              <button
                type="button"
                onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                className="rounded px-2 text-rose-500 hover:bg-rose-50"
                title="O'chirish"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addLine} className="btn-ghost mt-2 text-xs">
          + Qator qo'shish
        </button>

        <label className="mb-1 mt-4 block text-sm font-medium text-slate-600">Izoh</label>
        <input
          className="fld"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ixtiyoriy"
        />

        <div className="mt-4 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm">
          <span className="text-rose-700">Zarar (tannarx bo'yicha):</span>
          <b className="text-rose-700">{fmtMoney(jamiZarar)}</b>
        </div>

        <ErrorBox message={error} />

        <button type="submit" disabled={busy} className="btn-danger mt-4 w-full">
          {busy ? 'Bajarilmoqda…' : "Hisobdan chiqarish"}
        </button>
      </form>

      {/* ── O'ng: tarix ── */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800">Chiqarishlar tarixi</h2>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-2.5">Hujjat</th>
                <th className="px-4 py-2.5">Sana</th>
                <th className="px-4 py-2.5">Sabab</th>
                <th className="px-4 py-2.5">Izoh</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    Hali chiqarish yo'q
                  </td>
                </tr>
              )}
              {history.map((h) => (
                <tr key={h.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">
                    {h.docNo}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{fmtDateTime(h.date)}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                      {REASONS.find((r) => r.value === h.reason)?.nom ?? h.reason}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{h.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
