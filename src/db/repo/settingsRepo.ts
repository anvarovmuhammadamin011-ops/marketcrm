import { db } from '../database'
import { logAudit } from './auditRepo'
import { runSeed } from '../seed'

/**
 * SOZLAMALAR (kalit-qiymat) va ZAXIRA NUSXA (JSON export / import).
 *  - Baza butunlay faylga yoziladi → boshqa kompyuterga ko'chirish mumkin
 *  - Import bitta tranzaksiyada: muvaffaqiyatsiz bo'lsa hech narsa o'zgarmaydi
 */

export const SETTINGS_DEFAULTS = {
  shop_name: "Mening do'konim",
  currency: 'UZS',
  low_stock_percent: '20',
  last_backup: '',
  address: '',
  phone: '',
} as const

export type SettingKey = keyof typeof SETTINGS_DEFAULTS

export const SETTING_LABELS: Record<string, string> = {
  shop_name: "Do'kon nomi",
  address: 'Manzil',
  phone: 'Telefon',
  currency: 'Valyuta',
  low_stock_percent: 'Kam qoldiq ogohlantirish (%)',
  last_backup: 'Oxirgi zaxira',
}

/** Barcha sozlamalar (standart qiymatlar bilan to'ldirilgan) */
export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.settings.toArray()
  const map: Record<string, string> = { ...SETTINGS_DEFAULTS }
  for (const r of rows) map[r.key] = r.value
  return map
}

/** Bitta kalit qiymati */
export async function getSetting(key: SettingKey): Promise<string> {
  const row = await db.settings.where('key').equals(key).first()
  return row?.value ?? SETTINGS_DEFAULTS[key]
}

/**
 * Bitta kalitni saqlash.
 * `settings` jadvalida `++id` primary key bor — shuning uchun `put({key,value})`
 * ishlamaydi (unique `key` indeksiga uriladi). Avval mavjud yozuv topiladi.
 */
export async function setSetting(key: string, value: string): Promise<void> {
  const row = await db.settings.where('key').equals(key).first()
  if (row?.id != null) await db.settings.update(row.id, { value })
  else await db.settings.add({ key, value })
}

/** Bir nechta kalitni saqlash */
export async function setSettings(patch: Record<string, string>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    for (const [key, value] of Object.entries(patch)) {
      const row = await db.settings.where('key').equals(key).first()
      if (row?.id != null) await db.settings.update(row.id, { value })
      else await db.settings.add({ key, value })
    }
  })
}

/** "Kam qoldiq" chegarasi — mahsulotlar sahifasi shundan foydalanadi */
export function lowStockPercent(value: string | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 100) : Number(SETTINGS_DEFAULTS.low_stock_percent)
}

// ────────────────────── ZAXIRA NUSXA ──────────────────────

export const BACKUP_VERSION = 1

export interface BackupFile {
  app: 'dokon-crm'
  version: number
  createdAt: number
  tables: Record<string, unknown[]>
}

/** Bazaning to'liq nusxasi (JS obyekti) */
export async function exportBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {}
  for (const table of db.tables) {
    tables[table.name] = await table.toArray()
  }
  return { app: 'dokon-crm', version: BACKUP_VERSION, createdAt: Date.now(), tables }
}

export interface ImportResult {
  ok: boolean
  error?: string
  /** Har bir jadvalga qancha yozuv yozilgani */
  counts?: Record<string, number>
}

/** Zaxira faylni tekshirish va bazaga yozish */
export async function importBackup(raw: unknown, byUserId: number): Promise<ImportResult> {
  const file = raw as BackupFile | null

  if (!file || typeof file !== 'object') return { ok: false, error: 'Fayl formati noto\'g\'ri' }
  if (file.app !== 'dokon-crm') return { ok: false, error: 'Bu boshqa dasturning zaxira fayli' }
  if (!file.tables || typeof file.tables !== 'object') {
    return { ok: false, error: 'Faylda jadvallar yo\'q' }
  }
  if (file.version > BACKUP_VERSION) {
    return { ok: false, error: 'Fayl yangiroq versiya — ilovani yangilang' }
  }
  // Kamida foydalanuvchilar va mahsulotlar bo'lishi kerak
  if (!Array.isArray(file.tables.users) || file.tables.users.length === 0) {
    return { ok: false, error: 'Faylda foydalanuvchilar yo\'q' }
  }

  try {
    const counts = await db.transaction('rw', db.tables, async () => {
      const natija: Record<string, number> = {}
      for (const table of db.tables) {
        await table.clear()
        const qatorlar = file.tables[table.name]
        if (Array.isArray(qatorlar) && qatorlar.length > 0) {
          await table.bulkAdd(qatorlar as never[])
          natija[table.name] = qatorlar.length
        } else {
          natija[table.name] = 0
        }
      }
      return natija
    })

    // Xavfsizlik: importdan keyin takroriy to'ldirish (bo'sh jadvallar)
    await runSeed()

    await logAudit(byUserId, 'import', 'backup', `Zaxira fayl yuklandi (${file.version}-veriya)`, undefined, {
      counts,
    })
    return { ok: true, counts }
  } catch (err) {
    const xabar = err instanceof Error ? err.message : 'Noma\'lum xatolik'
    return { ok: false, error: `Yuklab bo'lmadi: ${xabar}` }
  }
}

/** Zaxira olindi deb belgilash */
export async function markBackupDone(byUserId: number): Promise<void> {
  await setSetting('last_backup', String(Date.now()))
  await logAudit(byUserId, 'backup', 'backup', 'Zaxira nusxa faylga saqlandi')
}

/** Jadvallar bo'yicha yozuvlar soni (sozlamalar sahifasi uchun) */
export async function tableStats(): Promise<Array<{ name: string; count: number }>> {
  const natija: Array<{ name: string; count: number }> = []
  for (const table of db.tables) {
    natija.push({ name: table.name, count: await table.count() })
  }
  return natija
}

/** Taxmoniy "ogohlantirish" — oxirgi zaxira qanchalab eski */
export function backupAgeText(lastBackup: string): { matn: string; ogohlantirish: boolean } {
  if (!lastBackup) return { matn: 'Hali zaxira olinmagan', ogohlantirish: true }
  const ts = Number(lastBackup)
  if (!Number.isFinite(ts)) return { matn: 'Noma\'lum', ogohlantirish: true }

  const kun = Math.floor((Date.now() - ts) / 86400000)
  if (kun <= 0) return { matn: 'Bugun olingan', ogohlantirish: false }
  if (kun === 1) return { matn: '1 kun oldin', ogohlantirish: false }
  if (kun <= 6) return { matn: `${kun} kun oldin`, ogohlantirish: false }
  return { matn: `${kun} kun oldin — yangilashni tavsiya qilamiz`, ogohlantirish: true }
}