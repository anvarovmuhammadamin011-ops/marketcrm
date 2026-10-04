import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { logout, useCurrentUser } from '../hooks/useAuth'
import type { ReactNode } from 'react'

/** Menyu bandlari: kim uchun ochiq va qaysi bosqichda ishlaydi */
interface MenuItem {
  to: string
  label: string
  roles: Array<'owner' | 'cashier'>
  bosqich: number
  icon: ReactNode
}

const ICON = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
    <path d={d} />
  </svg>
)

const MENU: MenuItem[] = [
  { to: '/kassa', label: 'Kassa', roles: ['owner', 'cashier'], bosqich: 4,
    icon: ICON('M3 7h18v10H3zM7 17v2M17 17v2M7 11h.01M12 11h.01M17 11h.01') },
  { to: '/mahsulotlar', label: 'Mahsulotlar', roles: ['owner'], bosqich: 2,
    icon: ICON('M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8') },
  { to: '/ombor', label: 'Ombor', roles: ['owner'], bosqich: 3,
    icon: ICON('M4 20V9M10 20V4M16 20v-7M22 20H2') },
  { to: '/chiqimlar', label: 'Chiqimlar', roles: ['owner'], bosqich: 5,
    icon: ICON('M12 3v12M7 10l5 5 5-5M4 21h16') },
  { to: '/hisobotlar', label: 'Hisobotlar', roles: ['owner'], bosqich: 6,
    icon: ICON('M3 3v18h18M7 15l4-4 3 3 5-6') },
  { to: '/foydalanuvchilar', label: 'Foydalanuvchilar', roles: ['owner'], bosqich: 7,
    icon: ICON('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87') },
  { to: '/sozlamalar', label: 'Sozlamalar', roles: ['owner'], bosqich: 7,
    icon: ICON('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z') },
]

/** Do'kon nomi — sozlamalar jadvalidan jonli o'qiladi */
function useShopName(): string {
  const settings = useLiveQuery(() => db.settings.toArray(), [])
  return settings?.find((s) => s.key === 'shop_name')?.value ?? "Do'kon"
}

/** Sarlavhadagi joriy sana-vaqt (har soniyada yangilanadi) */
function Clock() {
  const [text, setText] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setText(`${now.toLocaleDateString('uz-UZ')} · ${now.toLocaleTimeString('uz-UZ')}`)
    }
    tick() // darhol birinchi qiymat
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  return <span className="text-sm text-slate-500">{text}</span>
}

/**
 * Asosiy konstruktor: chap menyu + yuqori sarlavha + sahifa tuzilishi.
 * Foydalanuvchi roliga qarab menyu qisqaradi (kassir faqat Kassani ko'radi).
 */
export default function Layout() {
  const user = useCurrentUser()
  const shopName = useShopName()
  const navigate = useNavigate()

  if (!user) return null // RequireAuth allaqachon to'sib qo'yadi

  const items = MENU.filter((m) => m.roles.includes(user.role))

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Chap menyu ── */}
      <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-200">
        <div className="border-b border-slate-800 px-4 py-4">
          <div className="truncate text-lg font-bold text-white">{shopName}</div>
          <div className="text-xs text-slate-400">Kassa · Ombor · Hisobot</div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {m.icon}
              <span className="flex-1">{m.label}</span>
              {/* Keyingi bosqichda ochiladigan bo'limlar belgilanadi */}
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                {m.bosqich}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* ── Past: foydalanuvchi va chiqish ── */}
        <div className="border-t border-slate-800 p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{user.fullName}</div>
              <div className="text-xs text-slate-400">
                {user.role === 'owner' ? 'Egasi' : 'Kassir'}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2
                       text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            Chiqish
          </button>
        </div>
      </aside>

      {/* ── O'ng tomon: sarlavha + sahifa ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-5">
          <Clock />
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
            Oflayn rejim — ma'lumotlar shu kompyuterda
          </span>
        </header>
        <main className="flex-1 overflow-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
