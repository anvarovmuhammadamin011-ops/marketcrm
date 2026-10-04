import { useState } from 'react'
import { useCurrentUser } from '../../hooks/useAuth'
import InventoryPage from './InventoryPage'
import PurchasesPage from './PurchasesPage'
import StockPage from './StockPage'
import SuppliersPage from './SuppliersPage'
import WriteoffPage from './WriteoffPage'

interface Props {
  /** Odatda App'dan o'tadi; bo'lmasa joriy foydalanuvchi olinadi */
  userId?: number
}

const TABS = [
  { key: 'stock', nom: 'Qoldiq' },
  { key: 'purchases', nom: 'Kirim' },
  { key: 'inventory', nom: 'Inventarizatsiya' },
  { key: 'writeoff', nom: 'Hisobdan chiqarish' },
  { key: 'suppliers', nom: 'Yetkazib beruvchilar' },
] as const

type TabKey = (typeof TABS)[number]['key']

/** OMBOR — barcha ombor modullari yorliqlar (tabs) ichida */
export default function WarehousePage({ userId }: Props) {
  const user = useCurrentUser()
  const uid = userId ?? user?.id
  const [tab, setTab] = useState<TabKey>('stock')

  if (!uid) return null

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Ombor</h1>

      {/* ── Yorliqlar ── */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.key
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.nom}
          </button>
        ))}
      </div>

      {/* ── Tanlangan yorliq ── */}
      {tab === 'stock' && <StockPage />}
      {tab === 'purchases' && <PurchasesPage userId={uid} />}
      {tab === 'inventory' && <InventoryPage userId={uid} />}
      {tab === 'writeoff' && <WriteoffPage userId={uid} />}
      {tab === 'suppliers' && <SuppliersPage userId={uid} />}
    </div>
  )
}
