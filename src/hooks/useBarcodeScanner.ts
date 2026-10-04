import { useEffect, useRef } from 'react'

/**
 * Shtrix-kod skaneri uchun hook (klaviatura "wedge" usuli).
 *
 * QANDAY ISHLAYDI:
 * Ko'pgina USB/Bluetooth skanerlar klaviatura kabi ishlaydi —
 * kodni tez teradi va oxirida Enter (yoki F2) tugmasini bosadi.
 * Shu sababli skanerni alohida drayver o'rnatmasdan ham
 * oddiy qabul qiluvchi bilan tutish mumkin.
 *
 * Qoidalar:
 *  - Kod kamida `minLength` ta belgidan iborat bo'lishi kerak
 *    (oddiy qo'lda yozish bilan adashtirmaslik uchun)
 *  - Belgilar orasidagi pauza `maxGapMs` dan oshmasa — bu skaner deb hisoblanadi
 *  - Enter bosilganda yig'ilgan kod `onScan` ga yuboriladi
 *  - `ignoreWhenTyping = true` bo'lsa, matn kiritilayotgan joyda ishlamaydi
 *    (kassada esa false — skaner istalgan joyda tursin)
 *
 * Ishlatish:
 *   useBarcodeScanner((code) => savatgaQoshish(code), { minLength: 3 })
 */
export interface ScannerOptions {
  /** Minimal kod uzunligi (default 4) */
  minLength?: number
  /** Belgilar orasidagi maksimal pauza, ms (default 50) */
  maxGap?: number
  /** Faol emasligi (default true) */
  enabled?: boolean
  /** Matn kiritish maydonlarida ham ishlasinmi (default true) */
  ignoreWhenTyping?: boolean
}

export function useBarcodeScanner(
  onScan: (code: string) => void,
  options: ScannerOptions = {},
): void {
  const {
    minLength = 4,
    maxGap = 50,
    enabled = true,
    ignoreWhenTyping = false,
  } = options

  // Ong'a oqim — hook qayta yozilganda ham callback saqlanib qoladi
  const buffer = useRef('')
  const lastKeyAt = useRef(0)
  const onScanRef = useRef(onScan)

  // Eng oxirgi callback ni effect ichida saqlab boramiz (render paytida emas)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Foydalanuvchi matn kiryapti va skaner o'sha yerda ishlamasligi kerak
      if (ignoreWhenTyping && isTypingTarget(e.target)) return

      // Shift/Alt/Ctrl bilan bosilgan kombinatsiyalarni e'tiborga olmaymiz
      if (e.ctrlKey || e.altKey || e.metaKey) return

      const now = Date.now()

      if (e.key === 'Enter') {
        const code = buffer.current
        buffer.current = ''
        // Juda uzun va juda tez terilgan koddan boshqa hamma narsani qabul qilamiz
        if (code.length >= minLength) {
          e.preventDefault() // formani yuborishni bloklaymiz
          onScanRef.current(code)
        }
        return
      }

      // Boshqa maxsus tugmalar (Backspace va h.k.) — yig'uvchiga kirmaydi
      if (e.key.length > 1) {
        // Pauza uzoq bo'lsa — yangi yig'uvchidan boshlaymiz
        if (now - lastKeyAt.current > maxGap) buffer.current = ''
        lastKeyAt.current = now
        return
      }

      // Skaner juda tez yozadi: pauza uzoq bo'lsa, bu skaner emas — tozalaymiz
      if (now - lastKeyAt.current > maxGap) {
        buffer.current = ''
      }
      lastKeyAt.current = now
      buffer.current += e.key
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, ignoreWhenTyping, maxGap, minLength])
}
