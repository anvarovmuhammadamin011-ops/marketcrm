/** Pul va sana ko'rinishlari — barcha sahifalarda shu yerdan olinadi */

/** 12000 → "12 000" (so'm uchun, kasr yo'q) */
export function fmtMoney(value: number): string {
  const n = Math.round(value)
  const sign = n < 0 ? '-' : ''
  return sign + Math.abs(n).toLocaleString('ru-RU').replace(/,/g, ' ')
}

/** 12000 → "12 000 so'm" */
export function fmtSum(value: number): string {
  return `${fmtMoney(value)} so'm`
}

/** 6 → "6", 1.5 → "1.5" (kg uchun kasrli son) */
export function fmtQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : String(Number(qty.toFixed(3)))
}

/** Sonni o'lchov birligi bilan: 6 dona / 1.5 kg */
export function fmtQtyUnit(qty: number, unit: string): string {
  return `${fmtQty(qty)} ${unit}`
}

/** 2026-10-04 ko'rinishida (HTML date input uchun ham) */
export function toDateInput(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** HTML date qiymatini timestamp ga aylantirish (kun boshi) */
export function fromDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).getTime()
}

/** 2026-10-04 14:35 ko'rinishida */
export function fmtDateTime(ts: number): string {
  const d = new Date(ts)
  return `${toDateInput(ts)} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`
}

/** Kun boshigacha bo'lgan masofa (bugungi kunni aniqlash uchun) */
export function startOfDay(ts: number = Date.now()): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Hozirgi kun oxiri (23:59:59.999) */
export function endOfDay(ts: number = Date.now()): number {
  return startOfDay(ts) + 24 * 60 * 60 * 1000 - 1
}

/** Kichik harflarga o'tkazib solishtirish (qidiruv uchun) */
export function norm(s: string): string {
  return s.trim().toLowerCase()
}
