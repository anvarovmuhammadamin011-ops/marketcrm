import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { db } from '../../db/database'
import { login, useCurrentUser } from '../../hooks/useAuth'

/**
 * Kirish sahifasi (login / parol).
 * Kassir ham, egasi ham shu yerdan kiradi — roli keyingi sahifalarni cheklaydi.
 */
export default function LoginPage() {
  const user = useCurrentUser()
  const navigate = useNavigate()

  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Do'kon nomi sozlamalardan olinadi (seed dan keladi)
  const settings = useLiveQuery(() => db.settings.toArray(), [])
  const shopName = settings?.find((s) => s.key === 'shop_name')?.value ?? "Do'kon"

  // Allaqachon kirgan bo'lsa — kassaga o'tkazamiz
  if (user) return <Navigate to="/kassa" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const result = await login(loginName, password)
      if (result.ok) {
        // Egasi → hisobotga, kassir → kassaga (faqat bitta ruxsati bor)
        navigate(result.user.role === 'owner' ? '/hisobotlar' : '/kassa', { replace: true })
      } else {
        setError(result.error)
        setPassword('')
      }
    } catch (err) {
      console.error(err)
      setError('Xatolik yuz berdi. Brauzerda IndexedDB ochiq emasmi?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm">
        {/* ── Sarlavha ── */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-2xl font-black text-white">
            D
          </div>
          <h1 className="text-xl font-bold text-white">{shopName}</h1>
          <p className="text-sm text-slate-400">Kassa va ombor boshqaruvi</p>
        </div>

        {/* ── Forma ── */}
        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div>
            <label htmlFor="login" className="mb-1 block text-sm font-medium text-slate-600">
              Login
            </label>
            <input
              id="login"
              className="fld"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              autoFocus
              autoComplete="username"
              placeholder="admin"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-600">
              Parol
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="fld pr-16"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs
                           font-medium text-slate-500 hover:bg-slate-100"
              >
                {showPassword ? 'Yashirish' : 'Ko\'rsatish'}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
            {busy ? 'Tekshirilmoqda…' : 'Kirish'}
          </button>

          <p className="text-center text-xs text-slate-400">
            Birinchi kirish: <b className="text-slate-600">admin / admin123</b>
          </p>
        </form>
      </div>
    </div>
  )
}
