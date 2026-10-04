import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { downloadCsv, printPage } from '../../db/repo/export'
import { fmtMoney, fmtQty, fmtSum, fromDateInput, toDateInput } from '../../db/repo/helpers'
import {
  PRESET_LABELS,
  cashierStats,
  categoryStats,
  dailySeries,
  leastSoldProducts,
  presetPeriod,
  profitSummary,
  productStats,
  shiftStats,
  stockValue,
  type Period,
  type Preset,
} from '../../db/repo/reportsRepo'

/** HISOBOTLAR — foyda, mahsulotlar, kassir va ombor qiymati */
export default function ReportsPage() {
  const [preset, setPreset] = useState<Preset>('month')
  const [custom, setCustom] = useState(false)
  const [from, setFrom] = useState(toDateInput(Date.now() - 6 * 86400000))
  const [to, setTo] = useState(toDateInput(Date.now()))

  // Tayyor yoki qo'lda tanlangan davr
  const period: Period = useMemo(
    () =>
      custom
        ? { from: fromDateInput(from), to: fromDateInput(to) + 86400000 - 1 }
        : presetPeriod(preset),
    [custom, from, to, preset],
  )

  const s = useLiveQuery(() => profitSummary(period), [period.from, period.to], null)
  const days = useLiveQuery(() => dailySeries(period), [period.from, period.to], [])
  const cats = useLiveQuery(() => categoryStats(period), [period.from, period.to], [])
  const cashiers = useLiveQuery(() => cashierStats(period), [period.from, period.to], [])
  const top = useLiveQuery(() => productStats(period, { sort: 'total' }), [period.from, period.to], [])
  const bottom = useLiveQuery(() => leastSoldProducts(period), [period.from, period.to], [])
  const shifts = useLiveQuery(() => shiftStats(period), [period.from, period.to], [])
  const ombor = useLiveQuery(() => stockValue(), [], null)

  /** Sana yorlig'i bilan hisobot fayli nomi */
  const fileName = `hisobot-${toDateInput(period.from)}_${toDateInput(period.to)}`

  function exportAsCsv() {
    if (!s) return
    const qatorlar = [
      ['Davr', `${toDateInput(period.from)} — ${toDateInput(period.to)}`],
      ['Sotuvlar soni', s.salesCount],
      ['Jami tushum', s.salesTotal],
      ['Chegirmalar', s.discountTotal],
      ['Tannarx', s.costTotal],
      ['Yalpi foyda', s.grossProfit],
      ['Chiqimlar', s.expensesTotal],
      ['SOF FOYDA', s.netProfit],
      ["O'rtacha chek", s.avgCheck],
      ['Sotilgan tovar', fmtQty(s.itemsSold)],
      ['Naqd tushum', s.cashSales],
      ['Karta tushum', s.cardSales],
      ['Vozvratlar', s.returnsTotal],
      ['Bekor qilingan cheklar', s.voidCount],
      [],
      ['— TOP mahsulotlar —', '', '', ''],
      ['Mahsulot', 'Soni', 'Tushum', 'Foyda'],
      ...top.map((p) => [p.nom, fmtQty(p.qty), p.total, p.profit]),
      [],
      ['— Kategoriyalar —', '', '', ''],
      ['Kategoriya', 'Soni', 'Tushum', "Foiz (%)"],
      ...cats.map((c) => [c.nom, fmtQty(c.qty), c.total, c.ulush]),
      [],
      ['— Kassirlar —', '', '', ''],
      ['Kassir', 'Cheklar', 'Tushum', 'Foyda'],
      ...cashiers.map((c) => [c.fullName, c.salesCount, c.salesTotal, c.profit]),
    ]

    downloadCsv(
      `${fileName}.csv`,
      ['Hisobot', '', '', ''],
      qatorlar.map((q) => q.map((x) => x as string | number)),
    )
  }

  return (
    <div>
      {/* ── Sarlavha +eksport ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold text-slate-800">Hisobotlar</h1>
        <button className="btn-ghost" onClick={exportAsCsv}>
          Excel (CSV)
        </button>
        <button className="btn-ghost" onClick={() => printPage()}>
          PDF / chop etish
        </button>
      </div>

      {/* ── Davr tanlash ── */}
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="flex gap-1">
          {(Object.keys(PRESET_LABELS) as Preset[]).map((key) => (
            <button
              key={key}
              onClick={() => {
                setCustom(false)
                setPreset(key)
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                !custom && preset === key
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {PRESET_LABELS[key]}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={custom}
            onChange={(e) => setCustom(e.target.checked)}
          />
          Sana oralig'ini tanlash
        </label>

        {custom && (
          <>
            <input
              className="fld w-36"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="text-slate-400">—</span>
            <input
              className="fld w-36"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        )}

        <div className="ml-auto text-sm text-slate-500">
          {toDateInput(period.from)} — {toDateInput(period.to)}
        </div>
      </div>

      <div id="hisobot" className="print-area space-y-4">
        {/* ── Asosiy ko'rsatkichlar ── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            nom="Tushum"
            qiymat={s?.salesTotal ?? 0}
            yashir="so'm"
            rang="teal"
            izoh={`${s?.salesCount ?? 0} ta chek · o'rtacha ${fmtMoney(s?.avgCheck ?? 0)}`}
          />
          <Kpi
            nom="Yalpi foyda"
            qiymat={s?.grossProfit ?? 0}
            yashir="so'm"
            rang={(s?.grossProfit ?? 0) >= 0 ? 'emerald' : 'rose'}
            izoh={`Tannarx ${fmtMoney(s?.costTotal ?? 0)}`}
          />
          <Kpi
            nom="Chiqimlar"
            qiymat={s?.expensesTotal ?? 0}
            yashir="so'm"
            rang="rose"
            izoh="Ish haqi, ijara, kommunal…"
          />
          <Kpi
            nom="SOF FOYDA"
            qiymat={s?.netProfit ?? 0}
            yashir="so'm"
            rang={(s?.netProfit ?? 0) >= 0 ? 'emerald' : 'rose'}
            izoh="Yalpi foyda − chiqimlar"
            katta
          />
        </div>

        {/* ── Kunlik grafik ── */}
        <div className="card p-4">
          <h3 className="mb-4 text-sm font-bold text-slate-700">Kunlik tushum</h3>
          {days.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Bu davrda savdo bo'lmagan</p>
          ) : (
            <DailyChart points={days} />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ── To'lovlar va qo'shimcha ko'rsatkichlar ── */}
          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-700">Boshqa ko'rsatkichlar</h3>
            <div className="space-y-2 text-sm">
              <Line label="Naqd tushum" value={fmtSum(s?.cashSales ?? 0)} />
              <Line label="Karta tushum" value={fmtSum(s?.cardSales ?? 0)} />
              <Line label="Chegirmalar" value={fmtSum(s?.discountTotal ?? 0)} />
              <Line label="Sotilgan tovar" value={`${fmtQty(s?.itemsSold ?? 0)} birlik`} />
              <Line label="Vozvratlar" value={fmtSum(s?.returnsTotal ?? 0)} />
              <Line
                label="Bekor qilingan cheklar"
                value={String(s?.voidCount ?? 0)}
              />
            </div>

            {cats.length > 0 && (
              <>
                <h4 className="mb-2 mt-5 border-t border-slate-100 pt-4 text-sm font-bold text-slate-700">
                  Kategoriyalar kesimida
                </h4>
                <div className="space-y-2">
                  {cats.slice(0, 8).map((c) => (
                    <div key={c.categoryId}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-slate-600">{c.nom}</span>
                        <span className="text-slate-400">
                          {fmtMoney(c.total)} so'm · {c.ulush}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-teal-500"
                          style={{ width: `${Math.max(c.ulush, 2)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── TOP mahsulotlar ── */}
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-700">Eng ko'p sotilgan mahsulotlar</h3>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {top.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-400">Ma'lumot yo'q</td>
                  </tr>
                )}
                {top.map((p, i) => (
                  <tr key={p.productId} className="border-b border-slate-50">
                    <td className="w-8 px-3 py-2 text-center font-bold text-slate-300">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-700">{p.nom}</div>
                      <div className="text-xs text-slate-400">{p.categoryName}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {fmtQty(p.qty)} · {fmtMoney(p.total)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-600">
                      {fmtMoney(p.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ── Eng kam sotilganlar ── */}
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-700">Eng kam sotilgan mahsulotlar</h3>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {bottom.map((p) => (
                  <tr key={p.productId} className="border-b border-slate-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-700">{p.nom}</div>
                      <div className="text-xs text-slate-400">{p.categoryName}</div>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">
                      {p.qty > 0 ? `${fmtQty(p.qty)} · ${fmtMoney(p.total)}` : 'sotilmagan'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Kassirlar ── */}
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-700">Kassirlar kesimida</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Kassir</th>
                  <th className="px-4 py-2 text-center">Chek</th>
                  <th className="px-4 py-2 text-right">Tushum</th>
                  <th className="px-4 py-2 text-right">Foyda</th>
                </tr>
              </thead>
              <tbody>
                {cashiers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      Ma'lumot yo'q
                    </td>
                  </tr>
                )}
                {cashiers.map((c) => (
                  <tr key={c.userId} className="border-t border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-700">
                      {c.fullName}
                      <span className="ml-1 text-xs text-slate-400">{c.ulush}%</span>
                    </td>
                    <td className="px-4 py-2 text-center text-slate-600">{c.salesCount}</td>
                    <td className="px-4 py-2 text-right text-slate-600">
                      {fmtMoney(c.salesTotal)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-600">
                      {fmtMoney(c.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Ombor qiymati ── */}
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-700">Ombordagi tovar qiymati</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Mini nom="Mahsulotlar" qiymat={String(ombor?.productCount ?? 0)} izoh="ta xil" />
            <Mini
              nom="Tannarx qiymati"
              qiymat={fmtSum(ombor?.costValue ?? 0)}
              izoh="pulgacha investitsiya"
            />
            <Mini nom="Sotuv qiymati" qiymat={fmtSum(ombor?.retailValue ?? 0)} izoh="sotilsa" />
            <Mini
              nom="Kutilayotgan foyda"
              qiymat={fmtSum(ombor?.expectedProfit ?? 0)}
              izoh={ombor?.lowStockCount ? `${ombor.lowStockCount} ta kam qoldiq` : "kam qoldiq yo'q"}
              yashir={ombor?.lowStockCount ? 'warn' : undefined}
            />
          </div>

          {ombor && ombor.topValue.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="py-2">Eng qimmatli tovarlar</th>
                  <th className="py-2 text-right">Qoldiq</th>
                  <th className="py-2 text-right">Qiymati (tannarx)</th>
                </tr>
              </thead>
              <tbody>
                {ombor.topValue.map((t) => (
                  <tr key={t.nom} className="border-b border-slate-50">
                    <td className="py-2 text-slate-700">{t.nom}</td>
                    <td className="py-2 text-right text-slate-600">{fmtQty(t.qty)}</td>
                    <td className="py-2 text-right font-semibold text-slate-800">
                      {fmtMoney(t.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Smenalar ── */}
        {shifts.length > 0 && (
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-700">Smenalar</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Ochilgan</th>
                  <th className="px-4 py-2 text-center">Cheklar</th>
                  <th className="px-4 py-2 text-right">Tushum</th>
                  <th className="px-4 py-2 text-right">Kutilgan naqd</th>
                  <th className="px-4 py-2 text-right">Farq</th>
                  <th className="px-4 py-2">Holat</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((sh) => (
                  <tr key={sh.shiftId} className="border-t border-slate-50">
                    <td className="px-4 py-2 text-slate-600">{toDateInput(sh.openedAt)}</td>
                    <td className="px-4 py-2 text-center text-slate-600">{sh.salesCount}</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-800">
                      {fmtMoney(sh.salesTotal)}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">
                      {fmtMoney(sh.expectedCash)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${
                        sh.diff == null
                          ? 'text-slate-300'
                          : sh.diff === 0
                            ? 'text-emerald-600'
                            : sh.diff > 0
                              ? 'text-sky-600'
                              : 'text-rose-600'
                      }`}
                    >
                      {sh.diff == null ? '—' : `${sh.diff > 0 ? '+' : ''}${fmtMoney(sh.diff)}`}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          sh.status === 'open'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {sh.status === 'open' ? 'ochiq' : 'yopiq'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────── YORDAMCHI KOMPONENTLAR ───────────────────────────

type Rang = 'teal' | 'emerald' | 'rose' | 'amber'

const RANG_BORDER: Record<Rang, string> = {
  teal: 'border-teal-500',
  emerald: 'border-emerald-500',
  rose: 'border-rose-400',
  amber: 'border-amber-400',
}

const RANG_TEXT: Record<Rang, string> = {
  teal: 'text-teal-700',
  emerald: 'text-emerald-600',
  rose: 'text-rose-600',
  amber: 'text-amber-600',
}

function Kpi({
  nom,
  qiymat,
  yashir = 'so\'m',
  rang,
  izoh,
  katta,
}: {
  nom: string
  qiymat: number
  yashir?: string
  rang: Rang
  izoh?: string
  katta?: boolean
}) {
  return (
    <div className={`card border-l-4 p-4 ${RANG_BORDER[rang]}`}>
      <div className="text-xs font-semibold uppercase text-slate-400">{nom}</div>
      <div className={`mt-1 font-black ${RANG_TEXT[rang]} ${katta ? 'text-3xl' : 'text-2xl'}`}>
        {fmtMoney(qiymat)}
        {yashir && <span className="ml-1 text-sm font-medium text-slate-400">{yashir}</span>}
      </div>
      {izoh && <div className="mt-1 text-xs text-slate-400">{izoh}</div>}
    </div>
  )
}

function Mini({
  nom,
  qiymat,
  izoh,
  yashir,
}: {
  nom: string
  qiymat: string
  izoh?: string
  yashir?: 'warn'
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs uppercase text-slate-400">{nom}</div>
      <div className={`text-lg font-bold ${yashir === 'warn' ? 'text-amber-600' : 'text-slate-800'}`}>
        {qiymat}
      </div>
      {izoh && <div className="text-xs text-slate-400">{izoh}</div>}
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <b className="text-slate-800">{value}</b>
    </div>
  )
}

/** Kunlik tushum ustunli diagrammasi (CSS bilan, qo'shimcha kutubxonasiz) */
function DailyChart({ points }: { points: Array<{ day: string; salesTotal: number; costTotal: number }> }) {
  const max = Math.max(...points.map((p) => p.salesTotal), 1)
  // Juda ko'p kun bo'lsa oxirgisini ko'rsatamiz (grafik juda zich bo'lib ketmasin)
  const ko = points.slice(-31)

  return (
    <div>
      <div className="flex h-40 items-end gap-1">
        {ko.map((p) => {
          const tushum = Math.round((p.salesTotal / max) * 100)
          const foyda = Math.round((p.costTotal / max) * 100)
          return (
            <div key={p.day} className="group relative flex-1" title={`${p.day}: ${fmtSum(p.salesTotal)}`}>
              {/* tannarx (kulrang) va tushum (rangli) ustun */}
              <div className="relative h-40 w-full">
                <div
                  className="absolute bottom-0 w-full rounded-t bg-slate-200"
                  style={{ height: `${foyda}%` }}
                />
                <div
                  className="absolute bottom-0 w-full rounded-t bg-teal-500/90"
                  style={{ height: `${tushum}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span>{ko[0]?.day}</span>
        <span>
          Eng baland: {fmtMoney(Math.max(...points.map((p) => p.salesTotal)))} so'm
        </span>
        <span>{ko[ko.length - 1]?.day}</span>
      </div>
    </div>
  )
}