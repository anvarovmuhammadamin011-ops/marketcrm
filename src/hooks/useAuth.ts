import { db } from '../db/database'
import { verifyPassword } from '../db/crypto'
import { logAudit } from '../db/repo/auditRepo'
import { useAuthStore } from '../stores/authStore'
import type { User } from '../types'

// Audit jurnali boshqa joyda ham kerak bo'ladi — shu yerdan ham export qilamiz
export { logAudit }

/** Tizimga kirish. Xatolik xabari ma'lumot o'g'irlash uchun aytmaslik kerak — bitta xabar. */
export async function login(
  loginName: string,
  password: string,
): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const normalized = loginName.trim().toLowerCase()

  // Login katta-kichik harflarga e'tiborsiz qidiriladi
  const user = await db.users
    .filter((u) => u.login.toLowerCase() === normalized)
    .first()

  const genericError = 'Login yoki parol noto\'g\'ri'

  if (!user || !user.isActive) {
    return { ok: false, error: genericError }
  }

  const correct = await verifyPassword(password, user.passwordHash, user.salt)
  if (!correct) {
    return { ok: false, error: genericError }
  }

  // Jurnalga kirish yozuvi
  await logAudit(user.id!, 'login', 'session', `${user.login} tizimga kirdi`)

  useAuthStore.getState().setUser(user)
  return { ok: true, user }
}

/** Tizimdan chiqish */
export async function logout(): Promise<void> {
  const user = useAuthStore.getState().user
  if (user?.id) {
    await logAudit(user.id, 'logout', 'session', `${user.login} tizimdan chiqdi`)
  }
  useAuthStore.getState().setUser(null)
}

/** Joriy foydalanuvchi (render paytida) */
export function useCurrentUser(): User | null {
  return useAuthStore((s) => s.user)
}

/** Ruxsat tekshiruvi: `const canSeeReports = useCan('owner')` */
export function useCan(...roles: Array<User['role']>): boolean {
  const user = useCurrentUser()
  return !!user && roles.includes(user.role)
}
