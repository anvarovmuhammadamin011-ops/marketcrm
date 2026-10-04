/**
 * Parollarni xavfsiz saqlash uchun hash funksiyalari.
 * Brauzerda standart Web Crypto API ishlatiladi (qo'shimcha kutubxona shart emas).
 *
 * MUHIM: crypto.subtle faqat "secure context" da ishlaydi —
 * yani `http://localhost` yoki https. Shuning uchun ilovani
 * `npm run dev` orqali localhost orqali ochamiz.
 */

/** Tasodifiy 16 baytli tuz (salt) yaratish */
export function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** SHA-256 digest ni 16 likkonik satr ko'rinishida qaytarish */
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Parolni hashlash.
 * @returns hash va ishlatilgan tuz — ikkalasini ham bazaga saqlaymiz
 */
export async function hashPassword(
  password: string,
  salt?: string,
): Promise<{ hash: string; salt: string }> {
  const usedSalt = salt ?? randomSalt()
  const hash = await sha256Hex(`${usedSalt}:${password}`)
  return { hash, salt: usedSalt }
}

/** Parol to'g'riligini tekshirish (login paytida) */
export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  const { hash } = await hashPassword(password, storedSalt)
  return hash === storedHash
}
