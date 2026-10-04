import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { db } from '../db/database'
import type { User } from '../types'

/**
 * Joriy foydalanuvchi holati (Zustand).
 * `persist` middleware — sahifani yangilaganda ham login saqlanib qoladi
 * (kassir smena davomida qayta-kirishga majburlanmaydi).
 */
interface AuthState {
  user: User | null
  /** Bazadan ma'lumot yangilanganda chaqiriladi (rol o'zgarsa ham darhol aks etadi) */
  setUser: (user: User | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
    }),
    {
      name: 'dokon-auth', // localStorage kaliti
      // Faqat user id saqlanadi — parol hash i brauzer xotirasiga yozilmaydi
      partialize: (state) => ({ user: state.user ? { ...state.user, passwordHash: '', salt: '' } : null }),
    },
  ),
)

/** Eski login sessiyasi haqiqiy ekanini tekshirish (ilova ochilganda) */
export async function restoreSession(): Promise<void> {
  const stored = useAuthStore.getState().user
  if (!stored?.id) return

  const fresh = await db.users.get(stored.id)
  if (!fresh || !fresh.isActive) {
    // Foydalanuvchi o'chirilgan yoki parol o'zgargan bo'lsa — chiqaramiz
    useAuthStore.getState().setUser(null)
    return
  }
  useAuthStore.getState().setUser(fresh)
}
