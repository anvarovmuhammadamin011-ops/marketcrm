/**
 * CHEK CHOP ETISH (kassadan keyin va tarixdan qayta chop etish).
 *
 * Nima uchun alohida oynada (iframe): ilovaning o'z `@media print` qoidalari
 * butun sahifani yashiradi (`body * { visibility: hidden }`), shuning uchun
 * oddiy `window.print()` faqat `.print-area` ichidagini chiqaradi. Chek esa
 * tor (80 mm) formatda, oq-qora va mustaqil bo'lishi kerak.
 *
 * Chek oynasi maxsus oynada emas — yashirin iframe yaratiladi, shuning uchun
 * brauzer popup blokini qo'zgatmaydi.
 */
import { fmtDateTime, fmtMoney, fmtQty } from './helpers'
import type { Purchase, PurchaseItem, PurchasePayment, Sale, SaleItem, SalePayment, Setting } from '../../types'

const CHEK_QQ = '76mm' // 80 mm rulon uchun chetlar

interface ShopInfo {
  shop_name?: string
  address?: string
  phone?: string
}

/** iFrame orqali alohida hujjatni chop etish */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  if (!doc) {
    frame.remove()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()

  // Rasm (shtrix-kod) va shriftlar tayyor bo'lishini kutamiz
  const run = () => {
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } catch {
      window.print()
    } finally {
      // Dialog yopilishini kutib, keyin tozalaymiz
      setTimeout(() => frame.remove(), 1000)
    }
  }
  if (frame.contentWindow?.document.readyState === 'complete') setTimeout(run, 150)
  else frame.addEventListener('load', () => setTimeout(run, 150))
}

/** Chek uslubidagi umumiy qat'iy CSS */
function css(): string {
  return `
  @page { size: ${CHEK_QQ} auto; margin: 2mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Tahoma, sans-serif;
    font-size: 11px; line-height: 1.35; color: #000; background: #fff;
    width: ${CHEK_QQ}; padding: 2mm;
  }
  .center { text-align: center; }
  .big { font-size: 14px; font-weight: 700; }
  .bold { font-weight: 700; }
  .muted { color: #444; }
  hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .row { display: flex; justify-content: space-between; gap: 4px; }
  .name { padding-right: 3px; word-break: break-word; }
  .foot { margin-top: 5px; font-size: 10px; }
  .badge {
    display: inline-block; border: 1px solid #000; padding: 1px 5px;
    font-weight: 700; font-size: 11px;
  }
  .code { font-family: "Consolas", monospace; letter-spacing: 1px; }
  `
}

/** Xavfsiz escape (chek matni HTML ga qo'yiladi) */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Do'kon sarlavhasi */
function header(shop: ShopInfo, title: string, docNo: string): string {
  return `
    <div class="center">
      <div class="big">${esc(shop.shop_name || "Do'kon")}</div>
      ${shop.address ? `<div class="muted">${esc(shop.address)}</div>` : ''}
      ${shop.phone ? `<div>Tel: ${esc(shop.phone)}</div>` : ''}
      <hr />
      <div class="bold">${esc(title)}</div>
      <div>№ ${esc(docNo)}</div>
    </div>
  `
}

/** "Xizmat matni" — QR kod kiritilishi mumkin (ixtiyoriy) */
function footer(text: string): string {
  return `
    <hr />
    <div class="center foot">
      ${text}
      <div class="muted">${new Date().toLocaleString('ru-RU')}</div>
    </div>
  `
}

export interface ReceiptOptions {
  /** Avtomatik chop etish (PDF "Save as PDF" ham shu oynadan olinadi) */
  autoPrint?: boolean
}

// ─────────────────────────── SOTUV CHEKI ───────────────────────────

export interface SaleReceiptData {
  sale: Sale
  items: Array<SaleItem & { productNom: string }>
  payments: SalePayment[]
  cashier: string
  shop?: ShopInfo
}

/** Sotuv cheki HTML */
export function saleReceiptHtml(data: SaleReceiptData): string {
  const { sale, items, payments, cashier, shop = {} } = data
  const bekor = sale.status !== 'completed'

  const rows = items
    .map(
      (i) => `
      <tr>
        <td class="name">
          ${esc(i.productNom)}
          ${i.qty % 1 !== 0 ? '' : ''}
          <div class="muted">${fmtQty(i.qty)} × ${fmtMoney(i.unitPrice)}</div>
        </td>
        <td class="r bold">${fmtMoney(i.lineTotal)}</td>
      </tr>`,
    )
    .join('')

  const tolovlar = payments
    .map(
      (p) =>
        `<div class="row"><span>${p.method === 'cash' ? 'Naqd' : 'Karta'}</span><span class="r">${fmtMoney(p.amount)}</span></div>`,
    )
    .join('')

  const qaytim = payments.find((p) => p.change && p.change > 0)

  return `<!doctype html>
<html lang="uz"><head><meta charset="utf-8" /><title>Chek ${esc(sale.no)}</title>
<style>${css()}</style></head><body>
${header(shop, bekor ? 'CHEK (BEKOR QILINGAN)' : 'SOTUV CHEKI', sale.no)}
${bekor ? '<div class="center"><span class="badge">BEKOR QILINGAN</span></div>' : ''}
<div class="row"><span>Sana:</span><span>${fmtDateTime(sale.datetime)}</span></div>
<div class="row"><span>Kassir:</span><span>${esc(cashier)}</span></div>
<hr />
<table>${rows}</table>
<hr />
${sale.subtotal !== sale.total + sale.discount ? '' : ''}
<div class="row"><span>Jami:</span><span class="r">${fmtMoney(sale.subtotal)}</span></div>
${sale.discount > 0 ? `<div class="row"><span>Chegirma:</span><span class="r">−${fmtMoney(sale.discount)}</span></div>` : ''}
<div class="row big"><span>TO'LANADIGAN:</span><span class="r">${fmtMoney(sale.total)}</span></div>
<hr />
${tolovlar}
${qaytim ? `<div class="row"><span>Qaytim:</span><span class="r">${fmtMoney(qaytim.change!)}</span></div>` : ''}
${footer("Ehtiyot bo'ling — mahsulot qaytarish va almashtirish chek vaqtida Amalga oshadi.")}
</body></html>`
}

export function printSaleReceipt(data: SaleReceiptData): void {
  printHtml(saleReceiptHtml(data))
}

// ─────────────────────────── KIRIM HUJJATI ───────────────────────────

export interface PurchaseReceiptData {
  purchase: Purchase
  items: Array<PurchaseItem & { productNom?: string }>
  payments: PurchasePayment[]
  supplierNom: string
  shop?: ShopInfo
}

/** Yetkazib beruvchiga to'lanadigan hujjat ( kirim + qarz) HTML */
export function purchaseReceiptHtml(data: PurchaseReceiptData): string {
  const { purchase, items, payments, supplierNom, shop = {} } = data
  const qarz = purchase.total - purchase.paid

  const rows = items
    .map(
      (i) => `
      <tr>
        <td class="name">
          ${esc(i.productNom ?? '')}
          <div class="muted">${fmtQty(i.qty)} × ${fmtMoney(i.costPrice)}</div>
        </td>
        <td class="r bold">${fmtMoney(i.lineTotal)}</td>
      </tr>`,
    )
    .join('')

  const tolovlar = payments.length
    ? payments
        .map(
          (p) =>
            `<div class="row"><span>${fmtDateTime(p.date)} ${p.method === 'cash' ? 'naqd' : 'karta'}</span><span class="r">${fmtMoney(p.amount)}</span></div>`,
        )
        .join('')
    : '<div class="muted">To\'lov qilinmagan</div>'

  return `<!doctype html>
<html lang="uz"><head><meta charset="utf-8" /><title>Kirim ${esc(purchase.docNo)}</title>
<style>${css()}</style></head><body>
${header(shop, 'TOVAR KIRIMI HUJJATI', purchase.docNo)}
<div class="row"><span>Sana:</span><span>${fmtDateTime(purchase.date)}</span></div>
<div class="row"><span>Yetkazib beruvchi:</span><span>${esc(supplierNom)}</span></div>
<hr />
<table>${rows}</table>
<hr />
<div class="row"><span>Jami:</span><span class="r">${fmtMoney(purchase.total)}</span></div>
<div class="row"><span>To'langan:</span><span class="r">${fmtMoney(purchase.paid)}</span></div>
<div class="row big"><span>QARZ:</span><span class="r">${fmtMoney(qarz)}</span></div>
<hr />
<div class="bold">To'lovlar:</div>
${tolovlar}
${purchase.note ? `<hr /><div>Izoh: ${esc(purchase.note)}</div>` : ''}
${footer('Rahmat hamkorlik uchun!')}
</body></html>`
}

export function printPurchaseReceipt(data: PurchaseReceiptData): void {
  printHtml(purchaseReceiptHtml(data))
}

/** Sozlamalarni chek uchun yig'ish (tipli emas — jadval satrlaridan) */
export function shopFromSettings(rows: Setting[]): ShopInfo {
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    shop_name: map.get('shop_name'),
    address: map.get('address'),
    phone: map.get('phone'),
  }
}