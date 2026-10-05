import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Modal, { ErrorBox } from '../../components/ui/Modal'
import { fmtDateTime, fmtMoney } from '../../db/repo/helpers'
import { createSupplier } from '../../db/repo/stockRepo'
import {
  deleteSupplier,
  listSupplierPayments,
  listSupplierPurchases,
  listSupplierStats,
  updateSupplier,
  type SupplierRow,
} from '../../db/repo/suppliersRepo'
import type { PurchasePayment } from '../../types'
import PaymentModal, { type PaymentTarget } from './PaymentModal'

interface Props {
  userId: number
}

/** OMBOR — YETKAZIB BERUVCHILAR va QARZ NAZORATI */
export default function SuppliersPage({ userId }: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierRow | null>(null)
  const [card, setCard] = useState<SupplierRow | null>(null)
  const [payTarget, setPayTarget] = useState<PaymentTarget | null>(null)
  const [qidiruv, setQidiruv] = useState('')
  const [faqatQarz, setFaqatQarz] = useState(false)

  const suppliers = useLiveQuery<SupplierRow[], never[]>(() => listSupplierStats(), [], [])

  const filtered = useMemo(() => {
    const q = qidiruv.trim().toLowerCase()
    return suppliers.filter(
      (s) =>
        (!q || s.nom.toLowerCase().includes(q) || (s.telefon ?? '').includes(q)) &&
        (!faqatQarz || s.debt > 0),
    )
  }, [suppliers, qidiruv, faqatQarz])

  const jamiQarz = suppliers.reduce((s, x) => s + x.debt, 0)

  function openNew() {
    setEditing(null)
    setOpen(true)
  }

  async function handleRemove(s: SupplierRow) {
    if (!window.confirm(`"${s.nom}" o'chirilsinmi?`)) return
    try {
      await deleteSupplier(s.id!, userId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik')
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-slate-500">
          Yetkazib beruvchilar kirimga qo'llanadi va qarz hisobini osonlashtiradi.
        </p>
        {jamiQarz > 0 && (
          <div className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-600">
            Umumiy qarz: {fmtMoney(jamiQarz)} so'm
          </div>
        )}
        <button className="btn-primary" onClick={openNew}>
          + Yangi yetkazib beruvchi
        </button>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <input
          className="fld w-64"
          placeholder="Nom yoki telefon bo'yicha qidirish…"
          value={qidiruv}
          onChange={(e) => setQidiruv(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={faqatQarz} onChange={(e) => setFaqatQarz(e.target.checked)} />
          Faqat qarzi bor
        </label>
        {(qidiruv || faqatQarz) && (
          <button
            className="btn-ghost"
            onClick={() => {
              setQidiruv('')
              setFaqatQarz(false)
            }}
          >
            Tozalash
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">{filtered.length} ta</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3 text-right">Kirimlar</th>
              <th className="px-4 py-3 text-right">Olgan</th>
              <th className="px-4 py-3 text-right">To'lagan</th>
              <th className="px-4 py-3 text-right">Qarz</th>
              <th className="px-4 py-3 text-right">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  {suppliers.length === 0 ? "Hali yetkazib beruvchi yo'q" : 'Mos yetkazib beruvchi yo\'q'}
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <button
                    className="font-medium text-teal-700 hover:underline"
                    onClick={() => setCard(s)}
                  >
                    {s.nom}
                  </button>
                  {s.manzil && <div className="text-xs text-slate-400">{s.manzil}</div>}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{s.telefon || '—'}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">
                  {s.purchasesCount} ta
                  <div className="text-xs text-slate-400">{s.productsCount} xil tovar</div>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                  {fmtMoney(s.totalPurchased)}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600">{fmtMoney(s.totalPaid)}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={s.debt > 0 ? 'font-bold text-rose-600' : 'text-slate-400'}>
                    {s.debt > 0 ? fmtMoney(s.debt) : '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button
                      className="btn-ghost !px-2 !py-1 text-xs"
                      onClick={() => {
                        setEditing(s)
                        setOpen(true)
                      }}
                    >
                      Tahrirlash
                    </button>
                    <button
                      className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                      onClick={() => handleRemove(s)}
                    >
                      O'chirish
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SupplierForm open={open} supplier={editing} userId={userId} onClose={() => setOpen(false)} />
      <SupplierCard
        supplier={card}
        onClose={() => setCard(null)}
        onPay={(t) => {
          setCard(null)
          setPayTarget(t)
        }}
      />
      <PaymentModal
        open={!!payTarget}
        target={payTarget}
        userId={userId}
        onClose={() => setPayTarget(null)}
      />
    </div>
  )
}

/** Yetkazib beruvchi qo'shish/tahrirlash shakli */
function SupplierForm({
  open,
  supplier,
  userId,
  onClose,
}: {
  open: boolean
  supplier: SupplierRow | null
  userId: number
  onClose: () => void
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
    try {
      if (supplier) {
        await updateSupplier(
          supplier!.id!,
          {
            nom: nom.trim(),
            telefon: telefon.trim(),
            manzil: manzil.trim(),
            izoh: izoh.trim(),
          },
          userId,
        )
      } else {
        await createSupplier({
          nom: nom.trim(),
          telefon: telefon.trim(),
          manzil: manzil.trim(),
          izoh: izoh.trim(),
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik')
    }
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

/** Yetkazib beruvchi kartasi — kirimlar va to'lovlar tarixi */
function SupplierCard({
  supplier,
  onClose,
  onPay,
}: {
  supplier: SupplierRow | null
  onClose: () => void
  onPay: (t: PaymentTarget) => void
}) {
  const purchases = useLiveQuery(
    () => (supplier ? listSupplierPurchases(supplier.id!) : Promise.resolve([])),
    [supplier?.id],
    [],
  )
  const payments = useLiveQuery<PurchasePayment[], never[]>(
    () => (supplier ? listSupplierPayments(supplier.id!) : Promise.resolve([])),
    [supplier?.id],
    [],
  )

  if (!supplier) return null

  const qarz = (purchases ?? []).reduce((s, p) => s + p.debt, 0)

  return (
    <Modal open title={`Yetkazib beruvchi: ${supplier.nom}`} onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[
          ['Telefon', supplier.telefon || '—'],
          ['Manzil', supplier.manzil || '—'],
          ['Olgan', fmtMoney(supplier.totalPurchased)],
          ['Qarz', fmtMoney(qarz)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 p-2.5">
            <div className="text-xs text-slate-400">{k}</div>
            <div className="font-semibold text-slate-800">{v}</div>
          </div>
        ))}
      </div>

      <h3 className="mb-1 text-sm font-bold text-slate-700">
        Kirimlar ({purchases?.length ?? 0})
      </h3>
      <div className="mb-4 max-h-48 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1.5">Hujjat</th>
              <th className="py-1.5">Sana</th>
              <th className="py-1.5 text-right">Summa</th>
              <th className="py-1.5 text-right">Qarz</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {(purchases ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-slate-400">
                  Hali kirim yo'q
                </td>
              </tr>
            )}
            {(purchases ?? []).map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-1.5 font-mono text-slate-700">{p.docNo}</td>
                <td className="py-1.5 text-slate-500">{fmtDateTime(p.date)}</td>
                <td className="py-1.5 text-right">{fmtMoney(p.total)}</td>
                <td className="py-1.5 text-right">
                  <span className={p.debt > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}>
                    {p.debt > 0 ? fmtMoney(p.debt) : '—'}
                  </span>
                </td>
                <td className="py-1.5 text-right">
                  {p.debt > 0 && (
                    <button
                      className="btn-ghost !px-2 !py-0.5 text-xs !text-teal-700"
                      onClick={() =>
                        onPay({
                          purchaseId: p.id!,
                          docNo: p.docNo,
                          supplierNom: supplier.nom,
                          total: p.total,
                          paid: p.paid,
                        })
                      }
                    >
                      To'lash
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-1 text-sm font-bold text-slate-700">
        To'lovlar ({payments?.length ?? 0})
      </h3>
      <div className="max-h-40 overflow-y-auto text-xs text-slate-600">
        {(payments ?? []).length === 0 && (
          <p className="py-2 text-slate-400">Hali to'lov qilinmagan</p>
        )}
        <ul className="space-y-1">
          {(payments ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 border-b border-slate-50 py-1">
              <span>
                {fmtDateTime(p.date)} · {p.method === 'cash' ? 'naqd' : 'karta'}
                {p.fromCash ? ' (kassadan)' : ''} · #{p.purchaseId}
              </span>
              <b className="text-emerald-600">{fmtMoney(p.amount)}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex justify-end">
        <button className="btn-ghost" onClick={onClose}>
          Yopish
        </button>
      </div>
    </Modal>
  )
}