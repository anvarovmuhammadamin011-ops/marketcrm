/**
 * EKSPORT — ma'lumotlarni tashqariga chiqarish.
 *  - CSV  → Excel ochadi (UTF-8 BOM qo'yiladi, aks holda "o'zbekcha" harflar buziladi)
 *  - PDF  → brauzer orqali (joriy sahifa yoki maxsus yorliq chop etiladi)
 */

/** Bir katak qiymatini CSV uchun to'g'rilash */
function csvCell(value: string | number): string {
  const s = String(value)
  // vergul, qo'shtirnoq yoki yangi qator — qo'shtirnoq ichida, kerak bo'lsa
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * Jadvalni CSV fayl sifatida yuklab olish.
 * @param filename  masalan "hisobot-2026-10-04.csv"
 * @param headers   ustun nomlari
 * @param rows      qatorlar (massiv massiv yoki obyektlar)
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>,
): void {
  const lines = [headers.map(csvCell).join(';')]
  for (const row of rows) lines.push(row.map(csvCell).join(';'))

  // ";\n" — Excel (ru) va O'zbekiston Excel'i nuqtali vergulni taniydi
  const content = '\uFEFF' + lines.join(';\r\n')

  // 4 baytli BOM qo'shish (har bir faylda bo'lishi kerak)
  download(filename, content, 'text/csv;charset=utf-8')
}

/** Matn faylini yuklab olish */
export function download(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Brauzer darhol yuklab olmasligi uchun biroz kutamiz
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Sahifani PDF sifatida chop etish (brauzer dialogi orqali "PDF" tanlang) */
export function printPage(): void {
  window.print()
}