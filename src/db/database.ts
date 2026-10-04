import Dexie, { type Table } from 'dexie'
import type {
  AuditLog,
  Barcode,
  Batch,
  CashEvent,
  Category,
  Counter,
  Expense,
  ExpenseCategory,
  Inventory,
  InventoryItem,
  Product,
  ProductLink,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
  SalePayment,
  Setting,
  Shift,
  StockMovement,
  Supplier,
  User,
  Writeoff,
  WriteoffItem,
} from '../types'

/**
 * Ma'lumotlar bazasi — Dexie (IndexedDB) orqali brauzerda saqlanadi.
 * Server va internet SHART EMAS: barcha ma'lumot shu kompyuterdagi
 * brauzer xotirasida joylashadi (oflayn ishlash).
 *
 * Indeks qoidalari:
 *  - `++id`      → avtomatik oshiriluvchi asosiy kalit
 *  - `&nom`      → unikal (takrorlanmas) indeks
 *  - `nom`       → oddiy indeks (tez qidiruv)
 *  - `[a+b]`     → murakkab (compound) indeks
 *
 * Eslatma: unikal murakkab indeks (`&[a+b]`) Dexie'da noaniq ishlagani
 * uchun bunday holatlarda takrorlanishni ilova darajasida tekshiramiz.
 */
export class DokonDB extends Dexie {
  // Katalog
  categories!: Table<Category, number>
  products!: Table<Product, number>
  barcodes!: Table<Barcode, number>
  product_links!: Table<ProductLink, number>
  suppliers!: Table<Supplier, number>

  // Ombor
  batches!: Table<Batch, number>
  stock_movements!: Table<StockMovement, number>
  purchases!: Table<Purchase, number>
  purchase_items!: Table<PurchaseItem, number>
  inventories!: Table<Inventory, number>
  inventory_items!: Table<InventoryItem, number>
  writeoffs!: Table<Writeoff, number>
  writeoff_items!: Table<WriteoffItem, number>

  // Kassa
  shifts!: Table<Shift, number>
  sales!: Table<Sale, number>
  sale_items!: Table<SaleItem, number>
  sale_payments!: Table<SalePayment, number>
  cash_events!: Table<CashEvent, number>

  // Chiqimlar
  expense_categories!: Table<ExpenseCategory, number>
  expenses!: Table<Expense, number>

  // Tizim
  users!: Table<User, number>
  audit_log!: Table<AuditLog, number>
  settings!: Table<Setting, number>
  counters!: Table<Counter, number>

  constructor() {
    super('dokon_crm')

    this.version(1).stores({
      // ── Katalog ──
      // &nom → kategoriya nomi takrorlanmasin
      categories: '++id, &nom, parentId, sortOrder',
      // &barcode → shtrix-kod takrorlanmasin; bo'sh kod bo'lmaydi (ICH-xxxx ichki kod)
      products: '++id, &barcode, categoryId, unit, isActive, nom, updatedAt',
      // skanerlanadigan kodlar: masalan blok kodi → multiplier=6
      barcodes: '++id, &code, productId, [productId+code]',
      // 1 blok = 6 dona strukturasi
      product_links: '++id, packProductId, unitProductId, [packProductId+unitProductId]',
      suppliers: '++id, &nom, telefon',

      // ── Ombor ──
      // [productId+expiryDate] → FEFO: muddati eng yaqin partiyani tez topish
      batches: '++id, productId, expiryDate, supplierId, receivedAt, [productId+expiryDate]',
      // LEDGER: qoldiq = SUM(qty) WHERE productId = X
      stock_movements: '++id, [productId+createdAt], type, createdAt, refType, refId, batchId, userId',
      purchases: '++id, supplierId, date, status, docNo',
      purchase_items: '++id, purchaseId, productId, batchId',
      inventories: '++id, date, status, userId, docNo',
      inventory_items: '++id, inventoryId, productId',
      writeoffs: '++id, date, reason, userId, docNo',
      writeoff_items: '++id, writeoffId, productId, batchId',

      // ── Kassa ──
      shifts: '++id, status, openedAt, openedBy',
      // [shiftId+datetime] → smena bo'yicha savdolarni tez olish
      sales: '++id, datetime, userId, shiftId, status, no, [shiftId+datetime]',
      sale_items: '++id, saleId, productId, [saleId+productId]',
      sale_payments: '++id, saleId, method',
      cash_events: '++id, shiftId, type, createdAt, userId, refType, refId',

      // ── Chiqimlar ──
      expense_categories: '++id, &nom, sortOrder',
      expenses: '++id, date, categoryId, userId, shiftId',

      // ── Tizim ──
      users: '++id, &login, role, isActive',
      audit_log: '++id, userId, createdAt, entityType, action, [userId+createdAt]',
      settings: '++id, &key',
      counters: '++id, &key',
    })
  }
}

/** Ilova bo'ylab ishlatiladigan yagona baza instansiyasi */
export const db = new DokonDB()
