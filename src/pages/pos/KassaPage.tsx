import { useState } from 'react'
import { useCurrentUser } from '../../hooks/useAuth'
import PosPage from './PosPage'
import SalesHistoryPage from './SalesHistoryPage'
import ShiftGate from './ShiftGate'

interface Props {
  /** Odatda App'dan o'tadi; bo'lmasa joriy foydalanuvchi olinadi */
  userId?: number
}

type Tab = 'pos' | 'history'

/**
 * KASSA sahifasi.
 * Ikki yorliq:
 *  — "Sotuv": smena ochilgan bo'lishi shart (ShiftGate majburlaydi)
 *  — "Tarix": cheklar, bekor qilish va vozvrat (smenasiz ham ochiladi)
 */
export default function KassaPage({ userId }: Props) {
  const user = useCurrentUser()
  const uid = userId ?? user?.id
  const [tab, setTab] = useState<Tab>('pos')

  if (!uid) return null

  return (
    <div className="flex h-[calc(100vh-9.5rem)] min-h-[540px] flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold text-slate-800">Kassa</h1>

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              ['pos', 'Sotuv'],
              ['history', 'Tarix'],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
                tab === key
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'pos' ? (
          <ShiftGate userId={uid}>{(shift) => <PosPage shiftId={shift.id!} />}</ShiftGate>
        ) : (
          <SalesHistoryPage userId={uid} />
        )}
      </div>
    </div>
  )
}
