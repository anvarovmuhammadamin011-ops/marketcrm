import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import Modal from '../../components/ui/Modal'
import { fmtDateTime, fmtMoney } from '../../db/repo/helpers'
import {
  cancelSale,
  getSaleItems,
  listRecentSales,
  type SaleRow,
} from '../../db/repo/salesRepo'
import { useCurrentUser } from '../../hooks/useAuth'

type Filter = 'all' | 'completed' | 'returned' | 'void'

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Hammasi' },
  { key: 'completed', label: 'Bajarilgan' },
  { key: 'returned', label: 'Vozvrat' },
  { key: 'void', label: 'Bekor qilingan' },
]

const STATUS_LABEL: Record<SaleRow['status'], { text: string; cls: string }> = {
  completed: { text: 'Bajarildi', cls: 'bg-emerald-50 text-emerald-700' },
  returned: { text: 'Vozvrat', cls: 'bg-amber-50 text-amber-700' },
  void: { text: 'Bekor', cls: 'bg-rose-50 text-rose-700' },
}

/**
 * SOTUVLAR TARIXI
 * — cheklar ro'yxati, tafsilot, bekor qilish va vozvrat.
 * Bekor/vozvrat tovarni omborga qaytaradi (repo ichida tranzaksiyada).
 */
export default function SalesHistoryPage({ userId }: { userId: number }) {
  const user = useCurrentUser()
  const isOwner = user?.role === 'owner'

  const sales = useLiveQuery(() => listRecentSales(200), [], [] as SaleRow[])
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<SaleRow | null>(null)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sales.filter(
      (s) =>
        (filter === 'all' || s.status === filter) &&
        (!q ||
          s.no.toLowerCase().includes(q) ||
          s.kassirNom.toLowerCase().includes(q)),
    )
  }, [sales, filter, query])

  const totals = useMemo(() => {
    const done = rows.filter((s) => s.status === 'completed')
    return {
      count: rows.length,
      sum: done.reduce((acc, s) => acc + s.total, 0),
    }
  }, [rows])

  async function handleCancel(sale: SaleRow, mode: 'void' | 'returned') {
    const isVoid = mode === 'void'
    const question = isVoid
      ? `#${sale.no} cheki bekor qilinsinmi?\nTovar omborga qaytariladi.`
      : `#${sale.no} bo'yicha VOZVAT qilinsinmi?\nTovar omborga qaytariladi, pul mijozga qaytariladi.`
    if (!window.confirm(question)) return

    setBusy(true)
    try {
      await cancelSale(sale.id!, userId, mode)
      setDetail(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik yuz berdi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                filter === f.key
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          className="fld ml-auto w-56"
          placeholder="Chek raqami yoki kassir…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="text-sm text-slate-500">
          {totals.count} ta ·{' '}
          <b className="text-slate-800">{fmtMoney(totals.sum)}</b>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="px-4 py-3">Sana</th>
              <th className="px-4 py-3">Chek</th>
              <th className="px-4 py-3">Kassir</th>
              <th className="px-4 py-3 text-center">Tovar</th>
              <th className="px-4 py-3">To'lov</th>
              <th className="px-4 py-3 text-right">Summa</th>
              <th className="px-4 py-3">Holat</th>
              <th className="px-4 py-3 text-right">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  Sotuv topilmadi
                </td>
              </tr>
            )}

            {rows.map((s) => {
              const st = STATUS_LABEL[s.status]
              const methods = [...new Set(s.payments.map((p) => p.method))]
              return (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-600">{fmtDateTime(s.datetime)}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">#{s.no}</td>
                  <td className="px-4 py-2.5 text-slate-600">{s.kassirNom}</td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{s.itemSoni}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {methods.length === 0 ? '—' : methods.map((m) => (m === 'cash' ? 'Naqd' : 'Karta')).join(' + ')}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-semibold ${
                      s.status === 'completed' ? 'text-slate-800' : 'text-slate-400 line-through'
                    }`}
                  >
                    {fmtMoney(s.total)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${st.cls}`}>
                      {st.text}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      className="btn-ghost !px-2 !py-1 text-xs"
                      onClick={() => setDetail(s)}
                    >
                      Batafsil
                    </button>
                    {isOwner && s.status === 'completed' && (
                      <>
                        {' '}
                        <button
                          className="rounded border border-amber-200 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => handleCancel(s, 'void')}
                        >
                          Bekor qilish
                        </button>{' '}
                        <button
                          className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => handleCancel(s, 'returned')}
                        >
                          Vozvrat
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Bekor qilish va vozvrat faqat egasi uchun. Ikkalasida ham tovar omborga qaytariladi.
      </p>

      {detail && (
        <SaleDetail
          sale={detail}
          onClose={() => setDetail(null)}
          onVoid={() => handleCancel(detail, 'void')}
          onReturn={() => handleCancel(detail, 'returned')}
          canAct={isOwner && detail.status === 'completed'}
          busy={busy}
        />
      )}
    </div>
  )
}

/** Chek tafsiloti oynasi */
function SaleDetail({
  sale,
  onClose,
  onVoid,
  onReturn,
  canAct,
  busy,
}: {
  sale: SaleRow
  onClose: () => void
  onVoid: () => void
  onReturn: () => void
  canAct: boolean
  busy: boolean
}) {
  const items = useLiveQuery(
    () => getSaleItems(sale.id!),
    [sale.id],
    [] as Awaited<ReturnType<typeof getSaleItems>>,
  )

  return (
    <Modal open title={`Chek #${sale.no}`} onClose={onClose}>
      <div className="mb-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Sana</span>
          <b>{fmtDateTime(sale.datetime)}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Kassir</span>
          <b>{sale.kassirNom}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">To'lov</span>
          <b>
            {sale.payments.length === 0
              ? '—'
              : sale.payments
                  .map(
                    (p) =>
                      `${p.method === 'cash' ? 'Naqd' : 'Karta'}: ${fmtMoney(p.amount)}`,
                  )
                  .join(' · ')}
          </b>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-100">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase text-slate-500">
              <th className="px-3 py-2">Mahsulot</th>
              <th className="px-3 py-2 text-right">Soni</th>
              <th className="px-3 py-2 text-right">Narx</th>
              <th className="px-3 py-2 text-right">Jami</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-700">{i.productNom}</td>
                <td className="px-3 py-2 text-right text-slate-600">{i.qty}</td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {fmtMoney(i.unitPrice)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-800">
                  {fmtMoney(i.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
        <div className="flex justify-between text-slate-500">
          <span>Oraliq jami</span>
          <span>{fmtMoney(sale.subtotal)}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between text-rose-600">
            <span>Chegirma</span>
            <span>− {fmtMoney(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-black text-slate-800">
          <span>Jami</span>
          <span>{fmtMoney(sale.total)}</span>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Yopish
        </button>
        {canAct && (
          <>
            <button
              className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              disabled={busy}
              onClick={onVoid}
            >
              Bekor qilish
            </button>
            <button
              className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              disabled={busy}
              onClick={onReturn}
            >
              Vozvrat
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
