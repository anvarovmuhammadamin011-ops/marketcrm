import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import Modal from '../../components/ui/Modal'
import { db } from '../../db/database'
import { downloadCsv } from '../../db/repo/export'
import { fmtDateTime, fmtMoney, fmtQty, fromDateInput, toDateInput } from '../../db/repo/helpers'
import { listPurchasePayments } from '../../db/repo/suppliersRepo'
import { getPurchaseItems, listSuppliers } from '../../db/repo/stockRepo'
import type { Purchase, PurchasePayment } from '../../types'
import PaymentModal, { type PaymentTarget } from './PaymentModal'
import PurchaseModal from './PurchaseModal'

interface Props {
  userId: number
}

interface Row extends Purchase {
  supplierNom: string
  debt: number
}

/** Kirimlar ro'yxati (yetkazib beruvchi nomi va qarz bilan) */
async function loadPurchases(): Promise<Row[]> {
  const [rows, suppliers] = await Promise.all([
    db.purchases.orderBy('date').reverse().toArray(),
    db.suppliers.toArray(),
  ])
  const noms = new Map(suppliers.map((s) => [s.id!, s.nom]))
  return rows.map((p) => ({ ...p, supplierNom: noms.get(p.supplierId) ?? '—', debt: p.total - p.paid }))
}

/** OMBOR — KIRIM: yetkazib beruvchidan tovar qabul qilish tarixi va qarz nazorati */
export default function PurchasesPage({ userId }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [detail, setDetail] = useState<Purchase | null>(null)
  const [payTarget, setPayTarget] = useState<PaymentTarget | null>(null)

  // ── Filtrlar ──
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [supplierId, setSupplierId] = useState(0)
  const [faqatQarz, setFaqatQarz] = useState(false)

  const suppliers = useLiveQuery(() => listSuppliers(), [modalOpen], [])
  const purchases = useLiveQuery<Row[], never[]>(() => loadPurchases(), [modalOpen], [])

  const filtered = useMemo(() => {
    const fromTs = from ? fromDateInput(from) : 0
    const toTs = to ? fromDateInput(to) + 86400000 - 1 : Number.MAX_SAFE_INTEGER
    return purchases.filter(
      (p) =>
        p.date >= fromTs &&
        p.date <= toTs &&
        (!supplierId || p.supplierId === supplierId) &&
        (!faqatQarz || p.debt > 0),
    )
  }, [purchases, from, to, supplierId, faqatQarz])

  const jami = filtered.reduce((s, p) => s + p.total, 0)
  const tolagan = filtered.reduce((s, p) => s + p.paid, 0)
  const qarz = filtered.reduce((s, p) => s + p.debt, 0)

  function exportCsv() {
    downloadCsv(
      `kirimlar-${toDateInput(Date.now())}.csv`,
      ['Hujjat', 'Sana', 'Yetkazib beruvchi', 'Summa', "To'langan", 'Qarz'],
      filtered.map((p) => [
        p.docNo,
        fmtDateTime(p.date),
        p.supplierNom,
        p.total,
        p.paid,
        p.debt,
      ]),
    )
  }

  return (
    <div>
      {/* ── Statistika + amallar ── */}
      <div className="mb-4 flex flex-wrap items-end gap-6">
        <div>
          <div className="text-xs uppercase text-slate-400">Jami kirim</div>
          <div className="text-lg font-bold text-slate-800">{fmtMoney(jami)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">To'langan</div>
          <div className="text-lg font-bold text-slate-800">{fmtMoney(tolagan)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Qarz</div>
          <div className={`text-lg font-bold ${qarz > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
            {fmtMoney(qarz)}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost" onClick={exportCsv}>
            Excel
          </button>
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            + Yangi kirim
          </button>
        </div>
      </div>

      {/* ── Filtrlar ── */}
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Dan</span>
          <input className="fld w-36" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Gacha</span>
          <input className="fld w-36" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Yetkazib beruvchi</span>
          <select
            className="fld w-52"
            value={supplierId || ''}
            onChange={(e) => setSupplierId(Number(e.target.value))}
          >
            <option value="">Barchasi</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" checked={faqatQarz} onChange={(e) => setFaqatQarz(e.target.checked)} />
          Faqat qarzi bor
        </label>
        {(from || to || supplierId || faqatQarz) && (
          <button
            className="btn-ghost mb-1"
            onClick={() => {
              setFrom('')
              setTo('')
              setSupplierId(0)
              setFaqatQarz(false)
            }}
          >
            Filtrni tozalash
          </button>
        )}
        <span className="ml-auto pb-2 text-xs text-slate-400">{filtered.length} ta hujjat</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="px-4 py-3">Hujjat</th>
              <th className="px-4 py-3">Sana</th>
              <th className="px-4 py-3">Yetkazib beruvchi</th>
              <th className="px-4 py-3 text-right">Summa</th>
              <th className="px-4 py-3 text-right">To'langan</th>
              <th className="px-4 py-3 text-right">Qarz</th>
              <th className="px-4 py-3 text-right">Amal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  {purchases.length === 0
                    ? 'Hali kirim yo\'q — "Yangi kirim" tugmasi bilan boshlang'
                    : 'Filtrga mos keladigan kirim yo\'q'}
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">{p.docNo}</td>
                <td className="px-4 py-2.5 text-slate-600">{fmtDateTime(p.date)}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{p.supplierNom}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                  {fmtMoney(p.total)}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600">{fmtMoney(p.paid)}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={p.debt > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}>
                    {p.debt > 0 ? fmtMoney(p.debt) : '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    {p.debt > 0 && (
                      <button
                        className="btn-ghost !px-2 !py-1 text-xs !text-teal-700"
                        onClick={() =>
                          setPayTarget({
                            purchaseId: p.id!,
                            docNo: p.docNo,
                            supplierNom: p.supplierNom,
                            total: p.total,
                            paid: p.paid,
                          })
                        }
                      >
                        To'lash
                      </button>
                    )}
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setDetail(p)}>
                      Tafsilot
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PurchaseModal open={modalOpen} userId={userId} onClose={() => setModalOpen(false)} />
      <PurchaseDetail purchase={detail} onClose={() => setDetail(null)} />
      <PaymentModal
        open={!!payTarget}
        target={payTarget}
        userId={userId}
        onClose={() => setPayTarget(null)}
      />
    </div>
  )
}

/** Kirim tafsiloti — qatorlar ro'yxati va to'lovlar */
function PurchaseDetail({ purchase, onClose }: { purchase: Purchase | null; onClose: () => void }) {
  const items = useLiveQuery(
    () => (purchase ? getPurchaseItems(purchase.id!) : Promise.resolve([])),
    [purchase?.id],
    [],
  )
  const payments = useLiveQuery<PurchasePayment[], never[]>(
    () => (purchase ? listPurchasePayments(purchase.id!) : Promise.resolve([])),
    [purchase?.id],
    [],
  )

  return (
    <Modal open={!!purchase} title={`Kirim: ${purchase?.docNo ?? ''}`} onClose={onClose}>
      {purchase && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-400">Sana:</span> <b>{fmtDateTime(purchase.date)}</b>
            </div>
            <div>
              <span className="text-slate-400">To'langan:</span> <b>{fmtMoney(purchase.paid)}</b>
            </div>
            <div>
              <span className="text-slate-400">Qarz:</span>{' '}
              <b className={purchase.total - purchase.paid > 0 ? 'text-rose-600' : ''}>
                {fmtMoney(purchase.total - purchase.paid)}
              </b>
            </div>
            {purchase.note && (
              <div className="col-span-2">
                <span className="text-slate-400">Izoh:</span> {purchase.note}
              </div>
            )}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2">Mahsulot</th>
                <th className="py-2 text-right">Miqdor</th>
                <th className="py-2 text-right">Narx</th>
                <th className="py-2 text-right">Jami</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((i) => (
                <tr key={i.id} className="border-b border-slate-100">
                  <td className="py-2 text-slate-700">{i.productNom}</td>
                  <td className="py-2 text-right">{fmtQty(i.qty)}</td>
                  <td className="py-2 text-right">{fmtMoney(i.costPrice)}</td>
                  <td className="py-2 text-right font-semibold">{fmtMoney(i.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="py-2 text-right font-bold">
                  Jami:
                </td>
                <td className="py-2 text-right font-bold text-teal-700">{fmtMoney(purchase.total)}</td>
              </tr>
            </tfoot>
          </table>

          {(payments ?? []).length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-bold text-slate-700">To'lovlar</h3>
              <ul className="space-y-1 text-xs text-slate-500">
                {(payments ?? []).map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 border-b border-slate-50 py-1">
                    <span>
                      {fmtDateTime(p.date)} · {p.method === 'cash' ? 'naqd' : 'karta'}
                      {p.fromCash ? ' (kassadan)' : ''}
                    </span>
                    <b className="text-emerald-600">{fmtMoney(p.amount)}</b>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Modal>
  )
}