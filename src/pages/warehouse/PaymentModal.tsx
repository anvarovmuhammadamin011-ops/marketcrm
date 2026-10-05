import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import Modal, { ErrorBox } from '../../components/ui/Modal'
import { fmtMoney } from '../../db/repo/helpers'
import { payPurchase } from '../../db/repo/suppliersRepo'
import { getOpenShift } from '../../db/repo/salesRepo'
import type { Shift } from '../../types'

export interface PaymentTarget {
  purchaseId: number
  docNo: string
  supplierNom: string
  total: number
  paid: number
}

interface Props {
  open: boolean
  target: PaymentTarget | null
  userId: number
  onClose: () => void
}

/** Qarz to'lash oynasi — naqd bo'lsa smena bilan bog'lanadi */
export default function PaymentModal({ open, target, userId, onClose }: Props) {
  const shift = useLiveQuery<Shift | null, Shift | null>(
    () => (open ? getOpenShift() : Promise.resolve(null)),
    [open],
    null,
  )
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'card'>('cash')
  const [fromCash, setFromCash] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !target) return
    setError('')
    setOk('')
    setMethod('cash')
    setFromCash(true)
    setAmount(String(target.total - target.paid))
  }, [open, target])

  if (!open || !target) return null

  const qarz = target.total - target.paid
  const summa = Number(amount) || 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setOk('')
    setBusy(true)
    try {
      await payPurchase({
        purchaseId: target!.purchaseId,
        amount: summa,
        method,
        fromCash: method === 'cash' && fromCash,
        shiftId: fromCash ? (shift?.id ?? null) : null,
        userId,
      })
      setOk('To\'landi')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title={`Qarzni to'lash: ${target.docNo}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBox message={error} />}
        {ok && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {ok} — {fmtMoney(summa)} so'm
          </div>
        )}

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">{target.supplierNom}</span>
            <b>{fmtMoney(target.total)} so'm</b>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-slate-500">To'langan:</span>
            <span>{fmtMoney(target.paid)} so'm</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-slate-500">Qarz:</span>
            <b className="text-rose-600">{fmtMoney(qarz)} so'm</b>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">To'lanadigan summa</label>
          <input
            className="fld text-right"
            type="number"
            min={1}
            step={100}
            max={qarz}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            required
          />
          <p className="mt-1 text-xs text-slate-400">Maksimum: {fmtMoney(qarz)} so'm</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">To'lov turi</label>
          <div className="flex gap-2">
            {(
              [
                ['cash', 'Naqd'],
                ['card', 'Karta'],
              ] as Array<['cash' | 'card', string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMethod(key)}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                  method === key
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {method === 'cash' && (
          <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={fromCash}
              onChange={(e) => setFromCash(e.target.checked)}
            />
            <span>
              Kassadan naqd berilmoqda (smenadan chiqadi)
              {!shift && <span className="mt-0.5 block text-xs text-rose-600">
                Ochiq smena yo'q — belgilanmasa to'lov kassadan tashqarida deb hisoblanadi
              </span>}
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Yopish
          </button>
          <button type="submit" className="btn-primary" disabled={busy || summa <= 0}>
            {busy ? 'Saqlanmoqda…' : 'To\'lash'}
          </button>
        </div>
      </form>
    </Modal>
  )
}