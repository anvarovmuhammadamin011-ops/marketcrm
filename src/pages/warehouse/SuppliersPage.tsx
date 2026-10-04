import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import Modal, { ErrorBox } from '../../components/ui/Modal'
import { db } from '../../db/database'
import { createSupplier, deleteSupplier, listSuppliers } from '../../db/repo/stockRepo'
import type { Supplier } from '../../types'

interface Props {
  userId: number
}

/** OMBOR — YETKAZIB BERUVCHILAR */
export default function SuppliersPage({ userId: _userId }: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const suppliers = useLiveQuery(() => listSuppliers(), [open], [])

  function openNew() {
    setEditing(null)
    setOpen(true)
  }

  async function handleRemove(s: Supplier) {
    if (!window.confirm(`"${s.nom}" o'chirilsinmi?`)) return
    try {
      await deleteSupplier(s.id!)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik')
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <p className="mr-auto text-sm text-slate-500">
          Yetkazib beruvchilar kirimga qo'llanadi va qarz hisobini osonlashtiradi.
        </p>
        <button className="btn-primary" onClick={openNew}>
          + Yangi yetkazib beruvchi
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3">Manzil</th>
              <th className="px-4 py-3">Izoh</th>
              <th className="px-4 py-3 text-right">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Hali yetkazib beruvchi yo'q
                </td>
              </tr>
            )}
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{s.nom}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.telefon || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.manzil || '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.izoh || '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    className="btn-ghost !px-2 !py-1 text-xs"
                    onClick={() => {
                      setEditing(s)
                      setOpen(true)
                    }}
                  >
                    Tahrirlash
                  </button>{' '}
                  <button
                    className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                    onClick={() => handleRemove(s)}
                  >
                    O'chirish
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SupplierForm
        open={open}
        supplier={editing}
        onClose={() => setOpen(false)}
        existing={suppliers}
      />
    </div>
  )
}

function SupplierForm({
  open,
  supplier,
  onClose,
  existing,
}: {
  open: boolean
  supplier: Supplier | null
  onClose: () => void
  existing: Supplier[]
}) {
  const [nom, setNom] = useState('')
  const [telefon, setTelefon] = useState('')
  const [manzil, setManzil] = useState('')
  const [izoh, setIzoh] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setNom(supplier?.nom ?? '')
    setTelefon(supplier?.telefon ?? '')
    setManzil(supplier?.manzil ?? '')
    setIzoh(supplier?.izoh ?? '')
  }, [open, supplier])

  if (!open) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!nom.trim()) {
      setError('Nomni kiriting')
      return
    }
    if (supplier) {
      // Tahrirlash: nom unikal tekshiruvi bilan
      const dupe = existing.find(
        (s) => s.nom === nom.trim() && s.id !== supplier.id,
      )
      if (dupe) return setError('Bunday nom allaqachon bor')
      await db.suppliers.update(supplier.id!, {
        nom: nom.trim(),
        telefon: telefon.trim(),
        manzil: manzil.trim(),
        izoh: izoh.trim(),
      })
    } else {
      await createSupplier({
        nom: nom.trim(),
        telefon: telefon.trim(),
        manzil: manzil.trim(),
        izoh: izoh.trim(),
      })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      title={supplier ? 'Yetkazib beruvchini tahrirlash' : 'Yangi yetkazib beruvchi'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Nom *</label>
          <input className="fld" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Telefon</label>
          <input
            className="fld"
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
            placeholder="+998 90 123 45 67"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Manzil</label>
          <input className="fld" value={manzil} onChange={(e) => setManzil(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Izoh</label>
          <input className="fld" value={izoh} onChange={(e) => setIzoh(e.target.value)} />
        </div>

        <ErrorBox message={error} />

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Bekor qilish
          </button>
          <button type="submit" className="btn-primary">
            Saqlash
          </button>
        </div>
      </form>
    </Modal>
  )
}
