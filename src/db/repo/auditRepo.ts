import { db } from '../database'
import type { AuditLog } from '../../types'

/**
 * AUDIT JURNALI — "kim qachon nima qilgani".
 * Har bir muhim amal (kirish, kirim, sotuv, bekor qilish) shu yerga yoziladi.
 */
export async function logAudit(
  userId: number,
  action: string,
  entityType: string,
  summary: string,
  entityId?: number,
  details?: Record<string, unknown>,
): Promise<void> {
  await db.audit_log.add({
    userId,
    action,
    entityType,
    entityId,
    summary,
    details,
    createdAt: Date.now(),
  })
}

export interface AuditRow extends AuditLog {
  userNom: string
}

/** Jurnalni ko'rish (so'nggi yozuvlar birinchi) */
export async function listAuditLog(limit = 200): Promise<AuditRow[]> {
  const [rows, users] = await Promise.all([
    db.audit_log.orderBy('createdAt').reverse().limit(limit).toArray(),
    db.users.toArray(),
  ])
  const userMap = new Map(users.map((u) => [u.id, u.fullName]))
  return rows.map((r) => ({ ...r, userNom: userMap.get(r.userId) ?? `#${r.userId}` }))
}
