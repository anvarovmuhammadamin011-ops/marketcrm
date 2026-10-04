import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import { ErrorBox } from '../../components/ui/Modal'
import {
  linkPack,
  listProductLinks,
  listProducts,
  unlinkPack,
} from '../../db/repo/productsRepo'

interface Props {
  open: boolean
  userId: number
  onClose: () => void
}

/**
 * BLOK ↔ DONA BOG'LANISHI
 * Masalan: 1 blok = 6 dona.
 * Blok kodi skanerlanganda savatga avtomatik 6 dona tushadi.
 */
export default function LinksModal({ open, userId, onClose }: Props) {
  const links = useLiveQuery(() => listProductLinks(), [open], [])
  const products = useLiveQuery(() => listProducts(), [open], [])

  const [packProductId, setPackProductId] = useState(0)
  const [unitProductId, setUnitProductId] = useState(0)
  const [unitsPerPack, setUnitsPerPack] = useState('6')
  const [blockCode, setBlockCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setError('')
      setPackProductId(0)
      setUnitProductId(0)
      setUnitsPerPack('6')
      setBlockCode('')
    }
  }, [open])

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await linkPack(userId, {
        packProductId,
        unitProductId,
        unitsPerPack: Number(unitsPerPack),
        blockCode,
      })
      // Formani tozalash
      setPackProductId(0)
      setUnitProductId(0)
      setUnitsPerPack('6')
      setBlockCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlink(id: number) {
    if (!window.confirm("Bog'lanish o'chirilsinmi? Blok kodi ham o'chiriladi.")) return
    try {
      await unlinkPack(id, userId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={onClose}
    >
      <div
        className="card my-6 w-full max-w-3xl p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-800">Blok ↔ Dona bog'lanishi</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* ── Mavjud bog'lanishlar ── */}
        <div className="mb-5 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-3 py-2">Blok mahsulot</th>
                <th className="px-3 py-2">Dona mahsulot</th>
                <th className="px-3 py-2 text-center">Necha dona</th>
                <th className="px-3 py-2">Blok kodi</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(links ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    Hali bog'lanish yo'q
                  </td>
                </tr>
              )}
              {(links ?? []).map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-700">{l.packNom}</td>
                  <td className="px-3 py-2 text-slate-600">{l.unitNom}</td>
                  <td className="px-3 py-2 text-center font-bold text-teal-700">
                    1 = {l.unitsPerPack}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {l.blockCode || '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleUnlink(l.id!)}
                      className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                    >
                      O'chirish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Yangi bog'lanish ── */}
        <form onSubmit={handleSubmit} className="rounded-lg bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Yangi bog'lanish</h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">
                Blok mahsuloti
              </label>
              <select
                className="fld"
                value={packProductId || ''}
                onChange={(e) => setPackProductId(Number(e.target.value))}
                required
              >
                <option value="">— tanlang —</option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} ({p.unit})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">
                Dona mahsuloti
              </label>
              <select
                className="fld"
                value={unitProductId || ''}
                onChange={(e) => setUnitProductId(Number(e.target.value))}
                required
              >
                <option value="">— tanlang —</option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} ({p.unit})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">
                1 blokda necha dona
              </label>
              <input
                className="fld"
                type="number"
                min={2}
                step={1}
                value={unitsPerPack}
                onChange={(e) => setUnitsPerPack(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">
                Blok kodi (skaner uchun, ixtiyoriy)
              </label>
              <input
                className="fld font-mono"
                value={blockCode}
                onChange={(e) => setBlockCode(e.target.value)}
                placeholder="BLK-000003 yoki zavod kodi"
              />
            </div>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            Kod kiritilsa — skanerlanganda dona mahsulotdan{' '}
            <b>{Number(unitsPerPack) || 6} dona</b> savatga tushadi.
          </p>

          <ErrorBox message={error} />

          <div className="mt-3">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saqlanmoqda…' : "Bog'lash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
