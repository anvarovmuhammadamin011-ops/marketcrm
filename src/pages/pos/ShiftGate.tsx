import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent, type ReactNode } from 'react'
import { ErrorBox } from '../../components/ui/Modal'
import { fmtDateTime, fmtMoney } from '../../db/repo/helpers'
import {
  calcShiftSummary,
  closeShift,
  getOpenShift,
  openShift,
} from '../../db/repo/salesRepo'
import type { Shift } from '../../types'

interface Props {
  userId: number
  /** Smena ochiq bo'lganda chaqiriladi — shiftId shu yerdan olinadi */
  children: (shift: Shift) => ReactNode
}

/**
 * SMENA DARVOZASI
 * Kassa smenasiz ishlamaydi:
 *  - smena ochilmagan bo'lsa → "Smena ochish" ekrani
 *  - smena ochiq bo'lsa → yuqorida smena paneli + kassa
 *  - yopilganda → kutilayotgan vs haqiqiy naqd pul farqi ko'rsatiladi
 */
export default function ShiftGate({ userId, children }: Props) {
  const shift = useLiveQuery(() => getOpenShift(), [], null as Shift | null)
  // Yopilgan smena natijasi — smena yopilgach "yo'qolmasligi" uchun shu yerda
  const [closed, setClosed] = useState<Awaited<ReturnType<typeof closeShift>> | null>(null)

  if (shift === undefined) {
    return <div className="p-8 text-center text-slate-400">Smena tekshirilmoqda…</div>
  }

  if (closed) return <ClosedSummary summary={closed} onNew={() => setClosed(null)} />

  if (!shift) return <OpenShift userId={userId} />

  return (
    <div className="flex h-full flex-col gap-4">
      <ShiftPanel shift={shift} userId={userId} onClosed={setClosed} />
      <div className="min-h-0 flex-1">{children(shift)}</div>
    </div>
  )
}

/** Smena ochish ekrani */
function OpenShift({ userId }: { userId: number }) {
  const [cash, setCash] = useState('100000')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await openShift(Number(cash) || 0, userId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form onSubmit={submit} className="card w-full max-w-md p-6">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 7h18v10H3zM7 17v2M17 17v2" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800">Smena ochilmagan</h2>
          <p className="mt-1 text-sm text-slate-500">
            Savdo boshlash uchun smenani oching va kassadagi boshlang'ich naqd pulni kiriting.
          </p>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-600">
          Boshlang'ich naqd pul (so'm)
        </label>
        <input
          className="fld text-right text-lg font-bold"
          type="number"
          min="0"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
          autoFocus
        />

        <ErrorBox message={error} />

        <button type="submit" disabled={busy} className="btn-primary mt-4 w-full py-2.5">
          {busy ? 'Ochilmoqda…' : 'Smena ochish'}
        </button>
      </form>
    </div>
  )
}

/** Yuqoridagi smena paneli: hisob + yopish tugmasi */
function ShiftPanel({
  shift,
  userId,
  onClosed,
}: {
  shift: Shift
  userId: number
  onClosed: (s: Awaited<ReturnType<typeof closeShift>>) => void
}) {
  const summary = useLiveQuery(
    () => calcShiftSummary(shift.id!),
    [shift.id],
    null as Awaited<ReturnType<typeof calcShiftSummary>> | null,
  )
  const [closing, setClosing] = useState(false)

  const ochilgan = fmtDateTime(shift.openedAt)

  return (
    <>
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-sm font-bold text-slate-800">Smena ochiq</span>
          <span className="text-xs text-slate-400">{ochilgan}</span>
        </div>

        <div className="text-sm">
          <span className="text-slate-400">Savdolar:</span>{' '}
          <b className="text-slate-800">{summary?.salesCount ?? 0}</b>
        </div>
        <div className="text-sm">
          <span className="text-slate-400">Tushum:</span>{' '}
          <b className="text-slate-800">{fmtMoney(summary?.salesTotal ?? 0)}</b>
        </div>
        <div className="text-sm">
          <span className="text-slate-400">Kutilayotgan naqd:</span>{' '}
          <b className="text-teal-700">{fmtMoney(summary?.expectedCash ?? 0)}</b>
        </div>

        <button className="btn-ghost ml-auto" onClick={() => setClosing(true)}>
          Smenani yopish
        </button>
      </div>

      {closing && (
        <CloseShift
          shift={shift}
          userId={userId}
          expected={summary?.expectedCash ?? 0}
          onClose={() => setClosing(false)}
          onClosed={(s) => {
            setClosing(false)
            onClosed(s)
          }}
        />
      )}
    </>
  )
}

/** Smenani yopish oynasi */
function CloseShift({
  shift,
  userId,
  expected,
  onClose,
  onClosed,
}: {
  shift: Shift
  userId: number
  expected: number
  onClose: () => void
  onClosed: (s: Awaited<ReturnType<typeof closeShift>>) => void
}) {
  const [actual, setActual] = useState(String(expected))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const diff = (Number(actual) || 0) - expected

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await closeShift(Number(actual) || 0, userId)
      onClosed(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <form onSubmit={submit} className="card w-full max-w-md p-6">
        <h3 className="mb-4 border-b border-slate-100 pb-3 text-lg font-bold text-slate-800">
          Smenani yopish
        </h3>

        <div className="mb-3 space-y-1.5 text-sm">
          <Row label="Boshlang'ich naqd" value={fmtMoney(shift.openingCash)} />
          <Row label="Kutilayotgan naqd" value={fmtMoney(expected)} bold />
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-600">
          Kassir sanagan haqiqiy naqd (so'm)
        </label>
        <input
          className="fld text-right text-lg font-bold"
          type="number"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          autoFocus
        />

        <div
          className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${
            diff === 0
              ? 'bg-emerald-50 text-emerald-700'
              : diff > 0
                ? 'bg-sky-50 text-sky-700'
                : 'bg-rose-50 text-rose-700'
          }`}
        >
          <span>Farq (yiqilish):</span>
          <span>
            {diff > 0 ? '+' : ''}
            {fmtMoney(diff)}
          </span>
        </div>

        <ErrorBox message={error} />

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Bekor qilish
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Yopilmoqda…' : 'Yopish'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Yopilgan smena natijasi */
function ClosedSummary({
  summary,
  onNew,
}: {
  summary: Awaited<ReturnType<typeof closeShift>>
  onNew: () => void
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="card w-full max-w-md p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-slate-800">Smena yopildi</h2>

        <div className="mt-4 space-y-1.5 text-left text-sm">
          <Row label="Savdolar soni" value={String(summary.salesCount)} />
          <Row label="Umumiy tushum" value={fmtMoney(summary.salesTotal)} />
          <Row label="Naqd tushum" value={fmtMoney(summary.cashSales)} />
          <Row label="Kutilgan naqd" value={fmtMoney(summary.expectedCash)} />
          <Row label="Haqiqiy naqd" value={fmtMoney(summary.actualCash ?? 0)} />
          <Row
            label="Farq"
            value={`${(summary.diff ?? 0) > 0 ? '+' : ''}${fmtMoney(summary.diff ?? 0)}`}
            bold
          />
        </div>

        <button onClick={onNew} className="btn-primary mt-5 w-full">
          Yangi smena ochish
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}:</span>
      <b className={bold ? 'text-slate-900' : 'text-slate-700'}>{value}</b>
    </div>
  )
}
