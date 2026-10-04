import { db } from '../database'
import { hashPassword, verifyPassword } from '../crypto'
import { logAudit } from './auditRepo'
import type { Role, User } from '../../types'

/**
 * FOYDALANUVCHILAR VA RUXSATLAR
 *  — rol: 'owner' (hammasi) | 'cashier' (faqat sotuv)
 *  — parol hech qachon ochiq holda saqlanmaydi (SHA-256 + salt)
 *  — xavfsizlik: oxirgi egasi o'chirilmaydi / o'zi o'zini bloklamaydi
 */

export interface UserRow extends User {
  salesCount: number // bajarilgan cheklari
  salesTotal: number // umumiy tushumi
  lastActionAt: number | null // oxirgi harakati
}

/** Barcha foydalanuvchilar (savdo statistikasi bilan) */
export async function listUsers(): Promise<UserRow[]> {
  const [users, sales, audit] = await Promise.all([
    db.users.toArray(),
    db.sales.toArray(),
    db.audit_log.toArray(),
  ])

  const saleStat = new Map<number, { count: number; total: number; last: number }>()
  for (const s of sales) {
    const cur = saleStat.get(s.userId) ?? { count: 0, total: 0, last: 0 }
    if (s.status === 'completed') {
      cur.count += 1
      cur.total += s.total
    }
    cur.last = Math.max(cur.last, s.datetime)
    saleStat.set(s.userId, cur)
  }

  const lastAction = new Map<number, number>()
  for (const a of audit) {
    lastAction.set(a.userId, Math.max(lastAction.get(a.userId) ?? 0, a.createdAt))
  }

  const rows = users.map((u) => {
    const st = saleStat.get(u.id!)
    return {
      ...u,
      salesCount: st?.count ?? 0,
      salesTotal: st?.total ?? 0,
      lastActionAt: lastAction.get(u.id!) ?? null,
    }
  })

  rows.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'owner' ? -1 : 1
    return b.createdAt - a.createdAt
  })
  return rows
}

export interface UserInput {
  login: string
  password: string
  fullName: string
  role: Role
}

/** Yangi foydalanuvchi qo'shish */
export async function createUser(input: UserInput, byUserId: number): Promise<number> {
  const login = input.login.trim().toLowerCase()
  const fullName = input.fullName.trim()

  if (!/^[a-z0-9._-]{3,20}$/.test(login)) {
    throw new Error("Login 3–20 ta belgidan iborat bo'lsin (kichik harf, raqam, . _ -)")
  }
  if (input.password.length < 4) throw new Error('Parol kamida 4 ta belgidan iborat bo\'lsin')
  if (!fullName) throw new Error('F.I.O kiriting')

  const mavjud = await db.users.filter((u) => u.login.toLowerCase() === login).first()
  if (mavjud) throw new Error('Bu login band')

  const { hash, salt } = await hashPassword(input.password)
  const id = await db.users.add({
    login,
    passwordHash: hash,
    salt,
    fullName,
    role: input.role,
    isActive: true,
    createdAt: Date.now(),
  })

  await logAudit(byUserId, 'create', 'user', `Yangi foydalanuvchi: ${fullName} (${login})`, id, {
    role: input.role,
  })
  return id as number
}

export interface UserPatch {
  fullName: string
  role: Role
  isActive: boolean
}

/** Foydalanuvchini tahrirlash (parolsiz) */
export async function updateUser(
  id: number,
  patch: UserPatch,
  byUserId: number,
): Promise<void> {
  const user = await db.users.get(id)
  if (!user) throw new Error('Foydalanuvchi topilmadi')

  const fullName = patch.fullName.trim()
  if (!fullName) throw new Error('F.I.O kiriting')

  const egalar = await activeOwnerCount()

  // Kamida bitta faol egasi qolishi shart
  if (user.role === 'owner' && (patch.role !== 'owner' || !patch.isActive)) {
    if (egalar <= 1) throw new Error("Kamida bitta faol egasi qolishi kerak — bu oxirgi egasi")
  }
  if (byUserId === id && !patch.isActive) {
    throw new Error("O'zingizni bloklay olmaysiz")
  }

  await db.users.update(id, { fullName, role: patch.role, isActive: patch.isActive })
  await logAudit(byUserId, 'update', 'user', `Foydalanuvchi yangilandi: ${fullName}`, id, {
    role: patch.role,
    isActive: patch.isActive,
  })
}

/** Parolni o'zgartirish (eski parol tekshiriladi) */
export async function changePassword(
  id: number,
  currentPassword: string,
  newPassword: string,
  byUserId: number,
): Promise<void> {
  const user = await db.users.get(id)
  if (!user) throw new Error('Foydalanuvchi topilmadi')

  if (byUserId === id) {
    const togri = await verifyPassword(currentPassword, user.passwordHash, user.salt)
    if (!togri) throw new Error("Eski parol noto'g'ri")
  }
  if (newPassword.length < 4) throw new Error('Yangi parol kamida 4 ta belgidan iborat bo\'lsin')
  if (currentPassword === newPassword) throw new Error('Yangi parol eskisidan farq qilishi kerak')

  const { hash, salt } = await hashPassword(newPassword)
  await db.users.update(id, { passwordHash: hash, salt })
  await logAudit(byUserId, 'update', 'user', `Parol o'zgartirildi: ${user.fullName}`, id)
}

/** Boshqa foydalanuvchiga parol tayinlash (eski parolsiz — egasi huquqi) */
export async function setPassword(
  id: number,
  newPassword: string,
  byUserId: number,
): Promise<void> {
  const user = await db.users.get(id)
  if (!user) throw new Error('Foydalanuvchi topilmadi')
  if (newPassword.length < 4) throw new Error('Parol kamida 4 ta belgidan iborat bo\'lsin')

  const { hash, salt } = await hashPassword(newPassword)
  await db.users.update(id, { passwordHash: hash, salt })
  await logAudit(byUserId, 'update', 'user', `Parol tayinlandi: ${user.fullName}`, id)
}

/** Faol egasilar soni (kamida 1 ta bo'lishi shart) */
export async function activeOwnerCount(): Promise<number> {
  const owners = await db.users.where('role').equals('owner').toArray()
  return owners.filter((u) => u.isActive).length
}

/** Foydalanuvchini bloklash / blokdan chiqarish */
export async function setUserActive(
  id: number,
  isActive: boolean,
  byUserId: number,
): Promise<void> {
  const user = await db.users.get(id)
  if (!user) throw new Error('Foydalanuvchi topilmadi')
  if (byUserId === id && !isActive) throw new Error('O\'zingizni bloklay olmaysiz')

  if (!isActive && user.role === 'owner' && (await activeOwnerCount()) <= 1) {
    throw new Error('Kamida bitta faol egasi qolishi kerak')
  }

  await db.users.update(id, { isActive })
  await logAudit(
    byUserId,
    isActive ? 'enable' : 'disable',
    'user',
    `${isActive ? ' Blokdan chiqarildi' : 'Bloklandi'}: ${user.fullName}`,
    id,
  )
}