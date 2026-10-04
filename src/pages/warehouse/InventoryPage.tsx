import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Modal, { ErrorBox } from '../../components/ui/Modal'
import { fmtDateTime, fmtQty } from '../../db/repo/helpers'
import { listProducts, type ProductRow } from '../../db/repo/productsRepo'
import {
  confirmInventory,
  getInventoryItems,
  listInventories,
} from '../../db/repo/stockRepo'
import type { Inventory } from '../../types'

interface Props {
  userId: number
}

interface RowState {
  actual: string
  reason: string
}

/** OMBOR — INVENTARIZATSIYA: tizimdagionni haqiqiy son bilan solishtirish */
export default function InventoryPage({ userId }: Props) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [detail, setDetail] = useState<Inventory | null>(null)

  const history = useLiveQuery(() => listInventories(), [editorOpen], [])

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <p className="mr-auto text-sm text-slate-500">
          Tovarni sanab, haqiqiy sonni kiriting — tizim bilan farq bo'lsa, qoldiq avtomatik
          tuzatiladi.
        </p>
        <button className="btn-primary" onClick={() => setEditorOpen(true)}>
          Yangi inventarizatsiya
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="px-4 py-3">Hujjat</th>
              <th className="px-4 py-3">Sana</th>
              <th className="px-4 py-3">Holat</th>
              <th className="px-4 py-3">Izoh</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Inventarizatsiya o'tkazilmagan
                </td>
              </tr>
            )}
            {history.map((h) => (
              <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">
                  {h.docNo}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{fmtDateTime(h.date)}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                    TASDIQLANGAN
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{h.note || '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setDetail(h)}>
                    Tafsilot
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InventoryEditor
        open={editorOpen}
        userId={userId}
        onClose={() => setEditorOpen(false)}
      />
      <InventoryDetail inventory={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

/** Inventarizatsiya yig'ish oynasi */
function InventoryEditor({
  open,
  userId,
  onClose,
}: {
  open: boolean
  userId: number
  onClose: () => void
}) {
  const products = useLiveQuery(() => listProducts(), [open], [] as ProductRow[])
  const [rows, setRows] = useState<Record<number, RowState>>({})
  const [q, setQ] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setRows({})
      setQ('')
      setNote('')
      setError('')
    }
  }, [open])

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return products
    return products.filter((p) => p.nom.toLowerCase().includes(t) || p.barcode.includes(t))
  }, [products, q])

  const filled = Object.entries(rows).filter(([, r]) => r.actual !== '')

  const farqSoni = filled.filter(([id, r]) => {
    const p = products.find((x) => x.id === Number(id))
    return p && Number(r.actual) - p.stock !== 0
  }).length

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    if (filled.length === 0) {
      setError("Kamida bitta mahsulotning haqiqiy sonini kiriting")
      return
    }
    setBusy(true)
    try {
      await confirmInventory({
        date: Date.now(),
        userId,
        note: note.trim() || undefined,
        lines: filled.map(([id, r]) => ({
          productId: Number(id),
          actualQty: Number(r.actual) || 0,
          reason: r.reason || undefined,
        })),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        className="card my-6 w-full max-w-5xl p-6 shadow-xl"
      >
        <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3">
          <h2 className="mr-auto text-lg font-bold text-slate-800">Inventarizatsiya</h2>
          <input
            className="fld w-64"
            placeholder="Mahsulot qidirish…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-3 py-2.5">Mahsulot</th>
                <th className="w-24 px-3 py-2.5 text-right">Tizimdagi</th>
                <th className="w-32 px-3 py-2.5 text-right">Haqiqiy son</th>
                <th className="w-24 px-3 py-2.5 text-center">Farq</th>
                <th className="w-56 px-3 py-2.5">Sabab</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const row = rows[p.id!]
                const actual = row?.actual ?? ''
                const diff = actual === '' ? null : Number(actual) - p.stock
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-700">{p.nom}</div>
                      <div className="font-mono text-xs text-slate-400">{p.barcode}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700">
                      {fmtQty(p.stock)}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="fld text-right"
                        type="number"
                        step="any"
                        value={actual}
                        placeholder="—"
                        onChange={(e) =>
                          setRows((prev) => ({
                            ...prev,
                            [p.id!]: {
                              actual: e.target.value,
                              reason: prev[p.id!]?.reason ?? '',
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {diff === null ? (
                        <span className="text-slate-300">—</span>
                      ) : diff === 0 ? (
                        <span className="text-emerald-600">✓ 0</span>
                      ) : (
                        <span className="font-bold text-rose-600">
                          {diff > 0 ? '+' : ''}
                          {fmtQty(diff)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="fld"
                        value={row?.reason ?? ''}
                        placeholder="yo'qoldi / buzildi…"
                        onChange={(e) =>
                          setRows((prev) => ({
                            ...prev,
                            [p.id!]: {
                              actual: prev[p.id!]?.actual ?? '',
                              reason: e.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <span>Kiritilgan: <b>{filled.length}</b></span>
          <span>
            Farq: <b className={farqSoni > 0 ? 'text-rose-600' : 'text-emerald-600'}>{farqSoni}</b>
          </span>
          <input
            className="fld ml-auto w-64"
            placeholder="Umumiy izoh (ixtiyoriy)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <ErrorBox message={error} />

        <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="btn-ghost">
            Bekor qilish
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saqlanmoqda…' : 'Tasdiqlash va tuzatish'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Inventarizatsiya tafsiloti */
function InventoryDetail({
  inventory,
  onClose,
}: {
  inventory: Inventory | null
  onClose: () => void
}) {
  const items = useLiveQuery(
    () => (inventory ? getInventoryItems(inventory.id!) : Promise.resolve([])),
    [inventory?.id],
    [],
  )
  const products = useLiveQuery(() => listProducts({ activeOnly: false }), [inventory?.id], [])

  const nomMap = new Map(products.map((p) => [p.id, p.nom]))

  return (
    <Modal
      open={!!inventory}
      title={`Inventarizatsiya: ${inventory?.docNo ?? ''}`}
      onClose={onClose}
      wide
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <th className="py-2">Mahsulot</th>
            <th className="py-2 text-right">Tizimda</th>
            <th className="py-2 text-right">Haqiqiy</th>
            <th className="py-2 text-right">Farq</th>
            <th className="py-2">Sabab</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((i) => (
            <tr key={i.id} className="border-b border-slate-100">
              <td className="py-2 text-slate-700">{nomMap.get(i.productId) ?? `#${i.productId}`}</td>
              <td className="py-2 text-right">{fmtQty(i.systemQty)}</td>
              <td className="py-2 text-right">{fmtQty(i.actualQty)}</td>
              <td
                className={`py-2 text-right font-bold ${
                  i.diff === 0 ? 'text-slate-400' : 'text-rose-600'
                }`}
              >
                {i.diff > 0 ? '+' : ''}
                {fmtQty(i.diff)}
              </td>
              <td className="py-2 text-slate-500">{i.reason || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}
