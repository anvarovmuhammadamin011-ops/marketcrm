import { logAudit } from './auditRepo'
import { getStockMap } from './stockRepo'
import { db } from '../database'
import { norm } from './helpers'
import type { Barcode, LabelType, Product, ProductLink, Unit } from '../../types'

/**
 * MAHSULOTLAR BAZASI
 * — CRUD, shtrix-kodlar, ichki kod generatori, blok↔dona bog'lanishi
 */

export interface ProductFilters {
  q?: string
  categoryId?: number
  activeOnly?: boolean
  lowOnly?: boolean
}

export interface ProductRow extends Product {
  categoryName: string
  stock: number
  low: boolean // qoldiq minimal darajada yoki undan kam
  stockValue: number // qoldiq × tannarx
  codes: string[] // barcha skanerlanadigan kodlari
}

/** Mahsulotlar ro'yxati (qoldiq va kategoriya nomi bilan) */
export async function listProducts(f: ProductFilters = {}): Promise<ProductRow[]> {
  const [products, categories, stockMap, allCodes] = await Promise.all([
    db.products.toArray(),
    db.categories.toArray(),
    getStockMap(),
    db.barcodes.toArray(),
  ])

  const catMap = new Map(categories.map((c) => [c.id, c.nom]))
  const codesMap = new Map<number, string[]>()
  for (const b of allCodes) {
    const list = codesMap.get(b.productId) ?? []
    list.push(b.code)
    codesMap.set(b.productId, list)
  }

  const q = norm(f.q ?? '')

  let rows: ProductRow[] = products.map((p) => {
    const stock = stockMap.get(p.id!) ?? 0
    return {
      ...p,
      categoryName: catMap.get(p.categoryId) ?? '—',
      stock,
      low: p.minQty > 0 && stock <= p.minQty,
      stockValue: Math.max(stock, 0) * p.costPrice,
      codes: codesMap.get(p.id!) ?? [],
    }
  })

  if (f.activeOnly !== false) rows = rows.filter((r) => r.isActive)
  if (f.categoryId) rows = rows.filter((r) => r.categoryId === f.categoryId)
  if (f.lowOnly) rows = rows.filter((r) => r.low)

  if (q) {
    rows = rows.filter(
      (r) =>
        norm(r.nom).includes(q) ||
        r.barcode.includes(q) ||
        r.codes.some((c) => c.includes(q)),
    )
  }

  rows.sort((a, b) => a.nom.localeCompare(b.nom, 'ru'))
  return rows
}

/** Bitta mahsulot (qoldig'i bilan) */
export async function getProduct(id: number): Promise<ProductRow | null> {
  const rows = await listProducts({ activeOnly: false })
  return rows.find((r) => r.id === id) ?? null
}

// ────────────────────── SHTRIX-KODLAR ──────────────────────

/** Ichki kod yaratish: ICH-000001, ICH-000002, ... (zavod kodi bo'lmaganlar uchun) */
export async function generateInternalCode(): Promise<string> {
  const existing = await db.products.where('barcode').startsWith('ICH-').toArray()
  let max = 0
  for (const p of existing) {
    const n = parseInt(p.barcode.slice(4), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `ICH-${String(max + 1).padStart(6, '0')}`
}

/** EAN-13 nazorat raqamini hisoblash (12 ta raqam berilganda) */
export function ean13CheckDigit(code12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const d = Number(code12[i])
    sum += i % 2 === 0 ? d : d * 3
  }
  return (10 - (sum % 10)) % 10
}

/** EAN-13 to'g'rimi? (13 ta raqam + nazorat raqami) */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12])
}

/** Kod bandmi? (boshqa mahsulotga tegishli bo'lmasligi kerak) */
export async function isBarcodeTaken(code: string, exceptProductId?: number): Promise<boolean> {
  const byProduct = await db.products.where('barcode').equals(code).first()
  if (byProduct && byProduct.id !== exceptProductId) return true

  const byAlias = await db.barcodes.where('code').equals(code).first()
  if (byAlias && byAlias.productId !== exceptProductId) return true

  return false
}

/**
 * Skanerlangan kodni echish.
 * Blok kodi bo'lsa → mahsulot + multiplier (masalan 6 dona).
 */
export async function resolveBarcode(
  code: string,
): Promise<{ product: Product; qty: number } | null> {
  const trimmed = code.trim()
  if (!trimmed) return null

  const alias = await db.barcodes.where('code').equals(trimmed).first()
  if (alias) {
    const product = await db.products.get(alias.productId)
    if (product?.isActive) return { product, qty: alias.multiplier || 1 }
  }

  const product = await db.products.where('barcode').equals(trimmed).first()
  if (product?.isActive) return { product, qty: 1 }

  return null
}

export async function listProductBarcodes(productId: number): Promise<Barcode[]> {
  return db.barcodes.where('productId').equals(productId).toArray()
}

export async function saveBarcode(
  productId: number,
  code: string,
  multiplier: number,
  note?: string,
): Promise<number> {
  const trimmed = code.trim()
  if (!trimmed) throw new Error("Kodni kiriting")
  if (multiplier < 1) throw new Error("Soni 1 dan kam bo'lishi mumkin emas")
  if (await isBarcodeTaken(trimmed, productId)) {
    throw new Error(`"${trimmed}" kodi boshqa mahsulotda allaqachon bor`)
  }
  return db.barcodes.add({ code: trimmed, productId, multiplier, note })
}

export async function removeBarcode(id: number): Promise<void> {
  await db.barcodes.delete(id)
}

// ────────────────────── CRUD ──────────────────────

export interface ProductInput {
  nom: string
  categoryId: number
  unit: Unit
  salePrice: number
  costPrice: number
  minQty: number
  trackBatch: boolean
  labelType: LabelType
  barcode: string // bo'sh qoldirilsa — ichki kod avtomatik yaratiladi
}

function validateProductInput(input: ProductInput): void {
  if (!input.nom.trim()) throw new Error('Mahsulot nomini kiriting')
  if (!input.categoryId) throw new Error('Kategoriyani tanlang')
  if (input.salePrice < 0) throw new Error("Sotuv narxi manfiy bo'lishi mumkin emas")
  if (input.costPrice < 0) throw new Error("Kirim narxi manfiy bo'lishi mumkin emas")
  if (input.minQty < 0) throw new Error("Minimal qoldiq manfiy bo'lishi mumkin emas")
}

/** Yangi mahsulot qo'shish (kod avtomatik yaratiladi agar bo'sh bo'lsa) */
export async function createProduct(input: ProductInput, userId: number): Promise<number> {
  validateProductInput(input)

  const code = input.barcode.trim() || (await generateInternalCode())
  if (await isBarcodeTaken(code)) {
    throw new Error(`"${code}" kodi allaqachon ishlatilgan`)
  }

  const productId = await db.transaction('rw', [db.products, db.barcodes, db.audit_log], async () => {
    const now = Date.now()
    const productId = (await db.products.add({
      nom: input.nom.trim(),
      barcode: code,
      categoryId: input.categoryId,
      unit: input.unit,
      costPrice: Math.round(input.costPrice),
      salePrice: Math.round(input.salePrice),
      minQty: input.minQty,
      trackBatch: input.trackBatch,
      labelType: input.labelType,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })) as number

    // Asosiy kod ham barcodes jadvaliga tushadi — skaner shu yerdan qidiradi
    await db.barcodes.add({
      code,
      productId,
      multiplier: 1,
      note: 'asosiy kod',
    })

    return productId
  })

  await logAudit(userId, 'create', 'product', `Mahsulot qo'shildi: ${input.nom} (${code})`, productId)
  return productId
}

/** Mahsulotni tahrirlash */
export async function updateProduct(id: number, input: ProductInput, userId: number): Promise<void> {
  validateProductInput(input)

  const product = await db.products.get(id)
  if (!product) throw new Error('Mahsulot topilmadi')

  const newCode = input.barcode.trim() || product.barcode
  if (newCode !== product.barcode && (await isBarcodeTaken(newCode, id))) {
    throw new Error(`"${newCode}" kodi allaqachon ishlatilgan`)
  }

  await db.transaction('rw', [db.products, db.barcodes, db.audit_log], async () => {
    await db.products.update(id, {
      nom: input.nom.trim(),
      barcode: newCode,
      categoryId: input.categoryId,
      unit: input.unit,
      costPrice: Math.round(input.costPrice),
      salePrice: Math.round(input.salePrice),
      minQty: input.minQty,
      trackBatch: input.trackBatch,
      labelType: input.labelType,
      updatedAt: Date.now(),
    })

    // Asosiy kod yozuvini moslashtirish
    const mainRow = await db.barcodes
      .where('productId')
      .equals(id)
      .and((r) => r.code === product.barcode || r.note === 'asosiy kod')
      .first()

    if (mainRow) {
      await db.barcodes.update(mainRow.id!, { code: newCode, multiplier: 1 })
    } else {
      await db.barcodes.add({ code: newCode, productId: id, multiplier: 1, note: 'asosiy kod' })
    }

    // Blok kodiga multiplier bergan bo'lsa — uni ham yangilaymiz
    const link = await db.product_links.where('unitProductId').equals(id).first()
    if (link?.blockCode) {
      const blockRow = await db.barcodes.where('code').equals(link.blockCode).first()
      if (blockRow) await db.barcodes.update(blockRow.id!, { multiplier: link.unitsPerPack })
    }
  })

  await logAudit(userId, 'update', 'product', `Mahsulot tahrirlandi: ${input.nom}`, id)
}

/** Mahsulotni arxivga yuborish (o'chirish emas — tarix saqlanadi) */
export async function setProductActive(id: number, isActive: boolean, userId: number): Promise<void> {
  await db.products.update(id, { isActive, updatedAt: Date.now() })
  await logAudit(
    userId,
    isActive ? 'restore' : 'archive',
    'product',
    isActive ? 'Mahsulot faollashtirildi' : 'Mahsulot arxivlandi',
    id,
  )
}

// ────────────────────── BLOK ↔ DONA ──────────────────────

export interface ProductLinkRow extends ProductLink {
  packNom: string
  unitNom: string
}

export async function listProductLinks(): Promise<ProductLinkRow[]> {
  const [links, products] = await Promise.all([
    db.product_links.toArray(),
    db.products.toArray(),
  ])
  const map = new Map(products.map((p) => [p.id, p.nom]))
  return links.map((l) => ({
    ...l,
    packNom: map.get(l.packProductId) ?? '—',
    unitNom: map.get(l.unitProductId) ?? '—',
  }))
}

/**
 * Blok ↔ dona bog'lanishini yaratish (1 blok = N dona).
 * `blockCode` kiritilsa — shu kod skanerlanganda N dona qo'shiladi.
 */
export async function linkPack(userId: number, input: {
  packProductId: number
  unitProductId: number
  unitsPerPack: number
  blockCode?: string
}): Promise<number> {
  const { packProductId, unitProductId, unitsPerPack } = input
  if (packProductId === unitProductId) {
    throw new Error('Blok va dona mahsuloti bir xil bo\'lishi mumkin emas')
  }
  if (!packProductId || !unitProductId) throw new Error('Ikkala mahsulotni ham tanlang')
  if (!(unitsPerPack >= 2)) throw new Error("Blokda kamida 2 dona bo'lishi kerak")

  const code = input.blockCode?.trim() ?? ''
  if (code && (await isBarcodeTaken(code, unitProductId))) {
    throw new Error(`"${code}" kodi allaqachon band`)
  }

  return db.transaction(
    'rw',
    [db.product_links, db.barcodes, db.audit_log],
    async () => {
      const linkId = (await db.product_links.add({
        packProductId,
        unitProductId,
        unitsPerPack,
        blockCode: code || undefined,
      })) as number

      // Blok kodi → dona mahsulotga `multiplier` bilan bog'lanadi
      if (code) {
        await db.barcodes.add({
          code,
          productId: unitProductId,
          multiplier: unitsPerPack,
          note: `Blok kodi — 1 blok = ${unitsPerPack} dona`,
        })
      }

      await logAudit(userId, 'create', 'product_link', `Blok bog'landi: 1 blok = ${unitsPerPack} dona`, linkId)
      return linkId
    },
  )
}

export async function unlinkPack(id: number, userId: number): Promise<void> {
  const link = await db.product_links.get(id)
  if (link?.blockCode) {
    const row = await db.barcodes.where('code').equals(link.blockCode).first()
    if (row && row.note?.startsWith('Blok kodi')) await db.barcodes.delete(row.id!)
  }
  await db.product_links.delete(id)
  await logAudit(userId, 'delete', 'product_link', "Blok bog'lanishi yechildi", id)
}
