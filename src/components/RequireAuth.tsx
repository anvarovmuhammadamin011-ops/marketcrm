import { Navigate, Outlet } from 'react-router-dom'
import { useCurrentUser } from '../hooks/useAuth'

/**
 * Himoya qilingan marshrutlar o'rami.
 * Foydalanuvchi tizimga kirmagan bo'lsa — /login sahifasiga yo'naltiradi.
 */
export default function RequireAuth() {
  const user = useCurrentUser()
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
