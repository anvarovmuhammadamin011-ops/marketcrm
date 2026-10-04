import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { fmtDateTime, fmtMoney, fmtQty } from '../../db/repo/helpers'
import { getPurchaseItems, listPurchases } from '../../db/repo/stockRepo'
import type { Purchase } from '../../types'
import Modal from '../../components/ui/Modal'
import PurchaseModal from './PurchaseModal'

interface Props {
  userId: number
}

/** OMBOR — KIRIM: yetkazib beruvchidan tovar qabul qilish tarixi */
export default function PurchasesPage({ userId }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [detail, setDetail] = useState<Purchase | null>(null)

  const purchases = useLiveQuery(() => listPurchases(), [modalOpen], [])

  const jami = purchases.reduce((s, p) => s + p.total, 0)
  const qarz = purchases.reduce((s, p) => s + (p.total - p.paid), 0)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto flex gap-6">
          <div>
            <div className="text-xs uppercase text-slate-400">Jami kirim</div>
            <div className="text-lg font-bold text-slate-800">{fmtMoney(jami)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-slate-400">Qarz</div>
            <div className={`text-lg font-bold ${qarz > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
              {fmtMoney(qarz)}
            </div>
          </div>
        </div>

        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          + Yangi kirim
        </button>
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
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Hali kirim yo'q — "Yangi kirim" tugmasi bilan boshlang
                </td>
              </tr>
            )}
            {purchases.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">
                  {p.docNo}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{fmtDateTime(p.date)}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{p.supplierNom}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                  {fmtMoney(p.total)}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600">{fmtMoney(p.paid)}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={p.total - p.paid > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}>
                    {fmtMoney(p.total - p.paid)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setDetail(p)}>
                    Tafsilot
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PurchaseModal open={modalOpen} userId={userId} onClose={() => setModalOpen(false)} />
      <PurchaseDetail purchase={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

/** Kirim tafsiloti — qatorlar ro'yxati */
function PurchaseDetail({ purchase, onClose }: { purchase: Purchase | null; onClose: () => void }) {
  const items = useLiveQuery(
    () => (purchase ? getPurchaseItems(purchase.id!) : Promise.resolve([])),
    [purchase?.id],
    [],
  )

  return (
    <Modal open={!!purchase} title={`Kirim: ${purchase?.docNo ?? ''}`} onClose={onClose}>
      {purchase && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-400">Sana:</span>{' '}
              <b>{fmtDateTime(purchase.date)}</b>
            </div>
            <div>
              <span className="text-slate-400">To'langan:</span>{' '}
              <b>{fmtMoney(purchase.paid)}</b>
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
                <td className="py-2 text-right font-bold text-teal-700">
                  {fmtMoney(purchase.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </Modal>
  )
}
