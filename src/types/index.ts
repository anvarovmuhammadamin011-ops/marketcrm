/**
 * Barcha jadvallar tip'lari.
 * Har bir interfeys = ma'lumotlar bazasidagi bitta jadval.
 * Dexie (IndexedDB) da `id` maydoni avtomatik oshiriladi (`++id`),
 * shuning uchun u `id?: number` deb belgilangan.
 */

/** O'lchov birligi */
export type Unit = 'dona' | 'kg' | 'litr' | 'blok' | 'quti'

/** Foydalanuvchi roli */
export type Role = 'owner' | 'cashier'

/** Etiketka chop etish formati */
export type LabelType = 'ean13' | 'code128' | 'qr'

// ─────────────────────────── KATALOG ───────────────────────────

/** Mahsulot kategoriyalari (ichki darajali: parentId orqali) */
export interface Category {
  id?: number
  nom: string
  parentId?: number | null
  sortOrder: number
}

/** Asosiy mahsulotlar jadvali */
export interface Product {
  id?: number
  nom: string
  barcode: string // EAN-13 yoki ichki kod (ICH-000123) — hech qachon bo'sh bo'lmaydi
  categoryId: number
  unit: Unit
  costPrice: number // og'irliklangan o'rtacha tannarx (UZS), kirmda yangilanadi
  salePrice: number // sotuv narxi (UZS)
  minQty: number // minimal qoldiq — undan kamayganda ogohlantirish
  trackBatch: boolean // partiya + yaroqlilik muddati kuzatuvi kerakmi
  labelType: LabelType // etiketka chop etiladigan format
  isActive: boolean // arxivlangan mahsulot sotilmaydi, lekin tarixda qoladi
  createdAt: number
  updatedAt: number
}

/**
 * Skanerlanadigan kodlar reestri (EAN-13, ichki kod, QR, alternativ kod).
 * `multiplier` — shu kod skanerlanganda savatga NECHTA birlik qo'shiladi.
 * Masalan: 1 blok = 6 dona bo'lsa, blok kodi productId=dona, multiplier=6 bo'ladi.
 */
export interface Barcode {
  id?: number
  code: string
  productId: number
  multiplier: number
  note?: string
}

/** Blok ↔ Dona strukturaviy bog'lanishi (1 blok = 6 dona) */
export interface ProductLink {
  id?: number
  packProductId: number // blok mahsulot
  unitProductId: number // dona mahsulot
  unitsPerPack: number // necha dona (masalan 6)
  blockCode?: string // blokning skanerlanadigan kodi (ixtiyoriy)
}

/** Yetkazib beruvchilar */
export interface Supplier {
  id?: number
  nom: string
  telefon?: string
  manzil?: string
  izoh?: string
}

// ─────────────────────────── OMBOR ───────────────────────────

/**
 * Partiyalar (batch) — yaroqlilik muddati kuzatiladigan mahsulotlar uchun.
 * `qty` — shu partiyadagi joriy qoldiq (kesh), haqiqat esa stock_movements.
 */
export interface Batch {
  id?: number
  productId: number
  batchNo?: string
  expiryDate?: number | null // yaroqlilik muddati (timestamp), null = muddatsiz
  qty: number
  costPrice: number
  supplierId?: number
  receivedAt: number
  closedAt?: number | null // partiya yopilgan sana (qoldiq 0 bo'lganda)
}

/** Harakat turi */
export type MovementType =
  | 'purchase' // kirim
  | 'sale' // sotuv
  | 'sale_return' // sotuvni qaytarish (vozvrat)
  | 'purchase_return' // yetkazib beruvchiga qaytarish
  | 'writeoff' // hisobdan chiqarish
  | 'adjustment' // inventarizatsiya farqi

/**
 * OMBOR LEDJERI — qoldiqning yagona haqiqat manbasi.
 * Qoldiq = SUM(qty) guruhlash (productId bo'yicha).
 * Har bir hujjat (kirim/sotuv/chiqarish) shu yerga yoziladi: + yoki -.
 */
export interface StockMovement {
  id?: number
  productId: number
  batchId?: number | null
  type: MovementType
  qty: number // + kirimga, - sotuv/chiqarishga
  costPrice: number // o'sha paytdagi tannarx (tarix uchun)
  salePrice?: number
  refType?: string // hujjat turi: 'sale' | 'purchase' | 'writeoff' | 'inventory'
  refId?: number // hujjat ID si
  userId: number
  createdAt: number
  note?: string
}

/** Tovar kirim hujjati */
export interface Purchase {
  id?: number
  supplierId: number
  date: number
  docNo: string // kirim raqami (counters dan)
  total: number
  paid: number // to'langan qism (qarz = total - paid)
  userId: number
  status: 'draft' | 'confirmed'
  note?: string
}

export interface PurchaseItem {
  id?: number
  purchaseId: number
  productId: number
  batchId?: number | null
  qty: number
  costPrice: number
  expiryDate?: number | null
  lineTotal: number
}

/** Inventarizatsiya (haqiqiy sonni solishtirish) */
export interface Inventory {
  id?: number
  date: number
  docNo: string
  userId: number
  status: 'draft' | 'confirmed'
  note?: string
}

export interface InventoryItem {
  id?: number
  inventoryId: number
  productId: number
  systemQty: number // tizimdagisi
  actualQty: number // haqiqiy (sanalgani)
  diff: number // actualQty - systemQty
  reason?: string
}

/** Hisobdan chiqarish (muddati o'tgan, buzilgan, yo'qolgan) */
export interface Writeoff {
  id?: number
  date: number
  docNo: string
  reason: 'expired' | 'damaged' | 'lost' | 'other'
  userId: number
  note?: string
}

export interface WriteoffItem {
  id?: number
  writeoffId: number
  productId: number
  batchId?: number | null
  qty: number
  costPrice: number
}

// ─────────────────────────── KASSA ───────────────────────────

/** Smena */
export interface Shift {
  id?: number
  openedAt: number
  closedAt?: number | null
  openedBy: number
  closedBy?: number
  openingCash: number // smena boshidagi kassadagi naqd pul
  expectedCash?: number // yopishda hisoblangan kutilayotgan naqd
  actualCash?: number // kassir sanagan haqiqiy naqd
  diff?: number // actualCash - expectedCash (yiqilish farqi)
  status: 'open' | 'closed'
}

/** Sotuv (chek) hujjati */
export interface Sale {
  id?: number
  no: string // chek raqami (counters dan)
  datetime: number
  userId: number
  shiftId: number
  subtotal: number // chegirmadan oldingi summa
  discount: number // chegirma summasi (UZS)
  total: number // to'lovga mo'ljallangan summa
  costTotal: number // tannarx (yalpi foyda hisobi uchun)
  status: 'completed' | 'void' | 'returned'
  note?: string
}

export interface SaleItem {
  id?: number
  saleId: number
  productId: number
  batchId?: number | null
  qty: number
  unitPrice: number
  costPrice: number
  discount: number
  lineTotal: number
}

/** To'lov turi. Aralash to'lovda 2 ta yozuv bo'ladi (cash + card). */
export type PaymentMethod = 'cash' | 'card'

export interface SalePayment {
  id?: number
  saleId: number
  method: PaymentMethod
  amount: number
  change?: number // naqd to'lovda qaytim (faqat cash uchun)
}

/** Kassadan naqd pul harakati (kiritish / chiqarish) */
export interface CashEvent {
  id?: number
  shiftId: number
  type: 'cash_in' | 'cash_out'
  amount: number
  reason: string
  userId: number
  createdAt: number
  /**
   * Bu harakat bir hujjatga bog'langan bo'lsa (masalan chiqim hujjati).
   * Alohida kiritilgan naqd harakatlarida bo'sh qoladi.
   */
  refType?: string
  refId?: number
}

// ─────────────────────────── CHIQIMLAR ───────────────────────────

export interface ExpenseCategory {
  id?: number
  nom: string
  sortOrder: number
}

export interface Expense {
  id?: number
  date: number
  categoryId: number
  amount: number
  userId: number
  shiftId?: number | null
  note?: string
}

// ─────────────────────────── TIZIM ───────────────────────────

export interface User {
  id?: number
  login: string
  passwordHash: string // SHA-256(salt + parol)
  salt: string // parolga qo'shilgan tasodifiy qatlam
  fullName: string
  role: Role
  isActive: boolean
  createdAt: number
}

/** Yetkazib beruvchiga to'lov (kirim qarzini yopish) */
export interface PurchasePayment {
  id?: number
  purchaseId: number
  supplierId: number
  date: number
  method: 'cash' | 'card'
  amount: number
  /** Naqd kassadan berilganmi (smena bilan bog'liq) */
  fromCash: boolean
  /** fromCash = true bo'lsa, qaysi smenadan chiqarilgan */
  shiftId?: number | null
  userId: number
  createdAt: number
  note?: string
}

/** Audit jurnali — kim qachon nima qilgani */
export interface AuditLog {
  id?: number
  userId: number
  action: string // 'login' | 'create' | 'update' | 'delete' | 'void_sale' | ...
  entityType: string // 'product' | 'sale' | 'purchase' | 'session' | ...
  entityId?: number
  summary: string // inson tilidagi qisqa izoh
  details?: Record<string, unknown>
  createdAt: number
}

/** Sozlamalar (kalit-qiymat) */
export interface Setting {
  id?: number
  key: string
  value: string
}

/** Hujjat raqamlari hisoblagichlari (sale_no, purchase_no, ...) */
export interface Counter {
  id?: number
  key: string
  value: number
}
