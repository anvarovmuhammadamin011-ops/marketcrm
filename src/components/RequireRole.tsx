import { Navigate, Outlet } from 'react-router-dom'
import { useCan } from '../hooks/useAuth'
import type { Role } from '../types'

/**
 * Rolga qarab kirish huquqi.
 * Menyuni yashirish yetarli emas — marshrut ham o'zida tekshiriladi
 * (kassir brauzerda `#/hisobotlar` yozsa ham ochilmaydi).
 */
export default function RequireRole({ roles }: { roles: Role[] }) {
  const allowed = useCan(...roles)
  if (!allowed) return <Navigate to="/kassa" replace />
  return <Outlet />
}