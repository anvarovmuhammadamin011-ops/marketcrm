import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import RequireRole from './components/RequireRole'
import { runSeed } from './db/seed'
import { restoreSession } from './stores/authStore'
import LoginPage from './pages/auth/LoginPage'
import ProductsPage from './pages/products/ProductsPage'
import KassaPage from './pages/pos/KassaPage'
import ExpensesPage from './pages/expenses/ExpensesPage'
import ReportsPage from './pages/reports/ReportsPage'
import SettingsPage from './pages/settings/SettingsPage'
import UsersPage from './pages/users/UsersPage'
import WarehousePage from './pages/warehouse/WarehousePage'

/**
 * Ilova kirish nuqtasi.
 * 1) Seed (boshlang'ich ma'lumotlar) bir marta ishlaydi
 * 2) Avvalgi sessiya tiklanadi (sahifa yangilansa ham login saqlanadi)
 * 3) Keyin marshrutlar ochiladi
 *
 * HashRouter tanlangan: `#/kassa` ko'rinishidagi manzil statik fayllarda
 * ham ishlaydi — internet server shart emas (oflayn ochilsa ham).
 */
export default function App() {
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await runSeed() // birinchi ochilganda boshlang'ich ma'lumotlar
        await restoreSession() // brauzerda saqlangan loginni tiklash
      } catch (err) {
        console.error('Ishga tushirish xatosi:', err)
        if (!cancelled) {
          setBootError(
            "Ma'lumotlar bazasini ochib bo'lmadi. Brauzer sozlamalarida " +
              "sayt uchun ma'lumotlarga ruxsat bergan bo'ling.",
          )
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── Yuklanayotgan ekran ──
  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-900">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
        <p className="text-sm text-slate-400">Baza tayyorlanmoqda…</p>
      </div>
    )
  }

  // ── Baza ochilmagan bo'lsa (IndexedDB bloklangan) ──
  if (bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
        <div className="card max-w-md p-6">
          <h1 className="mb-2 text-lg font-bold text-rose-700">Xatolik</h1>
          <p className="text-sm text-slate-600">{bootError}</p>
        </div>
      </div>
    )
  }

  return (
    <HashRouter>
      <Routes>
        {/* Kirish sahifasi — hamma uchun ochiq */}
        <Route path="/login" element={<LoginPage />} />

        {/* Himoyalangan qismi — Layout ichidagi barcha sahifalar */}
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/kassa" replace />} />

            {/* Bosqich 4 — Kassa */}
            <Route path="/kassa" element={<KassaPage />} />

{/* Bosqich 2–6 — faqat egasi */}
            <Route element={<RequireRole roles={['owner']} />}>
              {/* Bosqich 2 — Mahsulotlar */}
              <Route path="/mahsulotlar" element={<ProductsPage />} />

              {/* Bosqich 3 — Ombor */}
              <Route path="/ombor" element={<WarehousePage />} />

              {/* Bosqich 5 — Chiqimlar */}
              <Route path="/chiqimlar" element={<ExpensesPage />} />

              {/* Bosqich 6 — Hisobotlar */}
              <Route path="/hisabotlar" element={<ReportsPage />} />

              {/* Bosqich 7 — Foydalanuvchilar va audit jurnali */}
              <Route path="/foydalanuvchilar" element={<UsersPage />} />

              {/* Bosqich 7 — Sozlamalar va zaxira nusxa */}
              <Route path="/sozlamalar" element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>

        {/* Noma'lum manzil */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
