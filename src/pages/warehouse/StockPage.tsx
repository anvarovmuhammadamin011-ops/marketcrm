import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { fmtMoney, fmtQty } from '../../db/repo/helpers'
import { listProducts, type ProductRow } from '../../db/repo/productsRepo'

/** OMBOR — QOLDIQ: mahsulotlar qoldig'i, tannarx va umumiy qiymat */
export default function StockPage() {
  const [q, setQ] = useState('')
  const [lowOnly, setLowOnly] = useState(false)

  const products = useLiveQuery(
    () => listProducts({ q, lowOnly }),
    [q, lowOnly],
    [] as ProductRow[],
  )

  const jamiQiymat = products.reduce((s, p) => s + p.stockValue, 0)
  const kamSoni = products.filter((p) => p.low).length
  const kamQiymat = products.filter((p) => p.low).reduce((s, p) => s + p.stockValue, 0)

  return (
    <div>
      {/* ── Statistika ── */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Umumiy tovar qiymati" value={fmtMoney(jamiQiymat)} suffix="so'm" big />
        <Stat label="Mahsulot turlari" value={String(products.length)} />
        <Stat label="Kam qoldiq" value={String(kamSoni)} danger={kamSoni > 0} />
        <Stat label="Kam qoldiqdagi qiymat" value={fmtMoney(kamQiymat)} suffix="so'm" />
      </div>

      {/* ── Filtr ── */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          className="fld w-72"
          placeholder="Nom yoki kod bo'yicha qidirish…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
            className="h-4 w-4 accent-rose-600"
          />
          Faqat kam qoldiq
        </label>
      </div>

      {/* ── Jadval ── */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="px-4 py-3">Kod</th>
              <th className="px-4 py-3">Mahsulot</th>
              <th className="px-4 py-3">O'lchov</th>
              <th className="px-4 py-3 text-right">Qoldiq</th>
              <th className="px-4 py-3 text-right">Tannarx</th>
              <th className="px-4 py-3 text-right">Qiymat</th>
              <th className="px-4 py-3 text-center">Holat</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Mahsulot topilmadi
                </td>
              </tr>
            )}

            {products.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{p.barcode}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{p.nom}</td>
                <td className="px-4 py-2.5 text-slate-600">{p.unit}</td>
                <td
                  className={`px-4 py-2.5 text-right font-bold ${
                    p.low ? 'text-rose-600' : 'text-slate-800'
                  }`}
                >
                  {fmtQty(p.stock)}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600">{fmtMoney(p.costPrice)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                  {fmtMoney(p.stockValue)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {p.stock <= 0 ? (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
                      YO'Q
                    </span>
                  ) : p.low ? (
                    <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                      KAM
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      YETARLI
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  suffix,
  danger,
  big,
}: {
  label: string
  value: string
  suffix?: string
  danger?: boolean
  big?: boolean
}) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium uppercase text-slate-400">{label}</div>
      <div
        className={`${big ? 'text-xl' : 'text-lg'} font-bold ${
          danger ? 'text-rose-600' : 'text-slate-800'
        }`}
      >
        {value}
        {suffix && <span className="ml-1 text-xs font-normal text-slate-400">{suffix}</span>}
      </div>
    </div>
  )
}
