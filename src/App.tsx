import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import { runSeed } from './db/seed'
import { restoreSession } from './stores/authStore'
import LoginPage from './pages/auth/LoginPage'
import PlaceholderPage from './pages/PlaceholderPage'
import ProductsPage from './pages/products/ProductsPage'
import KassaPage from './pages/pos/KassaPage'
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

            {/* Bosqich 2 — Mahsulotlar */}
            <Route path="/mahsulotlar" element={<ProductsPage />} />

            {/* Bosqich 3 — Ombor */}
            <Route path="/ombor" element={<WarehousePage />} />

            {/* Bosqich 5 — Chiqimlar */}
            <Route
              path="/chiqimlar"
              element={
                <PlaceholderPage
                  title="Chiqimlar"
                  bosqich={5}
                  description="Ijara, ish haqi, kommunal va boshqa xarajatlar shu yerda qayd etiladi."
                  items={[
                    "6 ta kategoriya (ijara, ish haqi, kommunal, transport, soliq, boshqa)",
                    "Sana, summa, izoh bilan kiritish",
                    "Chiqimlar tahrirlash va o'chirish (faqat egasi)",
                  ]}
                />
              }
            />

            {/* Bosqich 6 — Hisobotlar */}
            <Route
              path="/hisobotlar"
              element={
                <PlaceholderPage
                  title="Foyda va hisobotlar"
                  bosqich={6}
                  description="Tushum, tannarx, sof foyda va TOP mahsulotlar shu yerda ko'rsatiladi."
                  items={[
                    "Kunlik / haftalik / oylik: tushum, tannarx, yalpi va sof foyda",
                    "Eng ko'p va eng kam sotilgan mahsulotlar",
                    "Ombordagi tovarning umumiy qiymati",
                    "Kassir bo'yicha hisobot",
                    "Excel / PDF eksport",
                  ]}
                />
              }
            />

            {/* Bosqich 7 — Foydalanuvchilar */}
            <Route
              path="/foydalanuvchilar"
              element={
                <PlaceholderPage
                  title="Foydalanuvchilar va ruxsatlar"
                  bosqich={7}
                  description="Kassir qo'shish, parol o'zgartirish va harakatlar jurnali shu yerda bo'ladi."
                  items={[
                    "Rollar: egasi (hammasi) va kassir (faqat sotuv)",
                    "Login / parol bilan kirish",
                    "Kim qachon nima qilgani — audit jurnali",
                  ]}
                />
              }
            />

            {/* Bosqich 7 — Sozlamalar */}
            <Route
              path="/sozlamalar"
              element={
                <PlaceholderPage
                  title="Sozlamalar"
                  bosqich={7}
                  description="Do'kon ma'lumotlari, egasi parolini o'zgartirish va zaxira nusxa shu yerda bo'ladi."
                  items={[
                    "Do'kon nomi, manzil, telefon",
                    "Kam qoldiq ogohlantirish foizi",
                    "Zaxira nusxa: JSON export / import",
                    "Oxirgi zaxira vaqti eslatmasi",
                  ]}
                />
              }
            />
          </Route>
        </Route>

        {/* Noma'lum manzil */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
