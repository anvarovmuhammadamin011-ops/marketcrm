import { hashPassword } from './crypto'
import { db } from './database'

/**
 * Boshlang'ich (seed) ma'lumotlar.
 * Ilova birinchi marta ochilganda bir marta ishlaydi —
 * `users` jadvali bo'sh emasligini tekshirib, qayta yozmaydi.
 *
 * Nima yoziladi:
 *  1. 6 ta kategoriya
 *  2. 6 ta chiqim turi (ijara, ish haqi, ...)
 *  3. Ega foydalanuvchisi: admin / admin123
 *  4. Sozlamalar (do'kon nomi, valyuta, ...)
 *  5. Hujjat raqamlari hisoblagichlari
 *  6. 7 ta namunaviy mahsulot + shtrix-kodlar (sinash uchun)
 */
export async function runSeed(): Promise<void> {
  // Allaqachon seed qilinganmi? — qayta yozmaymiz
  const userCount = await db.users.count()
  if (userCount > 0) return

  const now = Date.now()
  // Egasi paroli: admin123 (keyinchalik Sozlamalar bo'limida o'zgartiriladi)
  const owner = await hashPassword('admin123')

  // Barcha jadvallar bitta tranzaksiyada yoziladi:
  // biror qismi xato bo'lsa — hammasi bekor qilinadi (atomarlik)
  await db.transaction(
    'rw',
    [
      db.categories,
      db.products,
      db.barcodes,
      db.product_links,
      db.users,
      db.settings,
      db.counters,
      db.expense_categories,
    ],
    async () => {
      // ── 1. Kategoriyalar ──
      const kategoriyalar = [
        'Oziq-ovqat',
        'Ichimliklar',
        'Aralash',
        'Qandolat',
        'Sut mahsulotlari',
        'Guruch va makaron',
      ]
      const katIds: Record<string, number> = {}
      for (let i = 0; i < kategoriyalar.length; i++) {
        const nom = kategoriyalar[i]
        const id = await db.categories.add({ nom, parentId: null, sortOrder: i })
        katIds[nom] = id as number
      }

      // ── 2. Chiqim turlari ──
      const chiqimTurlari = ['Ijara', 'Ish haqi', 'Kommunal', 'Transport', 'Soliq', 'Boshqa']
      for (let i = 0; i < chiqimTurlari.length; i++) {
        await db.expense_categories.add({ nom: chiqimTurlari[i], sortOrder: i })
      }

      // ── 3. Egasi (owner) ──
      await db.users.add({
        login: 'admin',
        passwordHash: owner.hash,
        salt: owner.salt,
        fullName: 'Do\'kon egasi',
        role: 'owner',
        isActive: true,
        createdAt: now,
      })

      // ── 4. Sozlamalar ──
      const sozlamalar: Array<[string, string]> = [
        ['shop_name', 'Mening do\'konim'],
        ['currency', 'UZS'],
        ['low_stock_percent', '20'], // kam qoldiq ogohlantirish foizi
        ['last_backup', ''], // bo'sh = zaxira nusxa hali olinmagan
        ['address', ''],
        ['phone', ''],
      ]
      for (const [key, value] of sozlamalar) {
        await db.settings.add({ key, value })
      }

      // ── 5. Hujjat raqamlari hisoblagichlari ──
      const hisoblagichlar = ['sale_no', 'purchase_no', 'inventory_no', 'writeoff_no']
      for (const key of hisoblagichlar) {
        await db.counters.add({ key, value: 0 })
      }

      // ── 6. Namunaviy mahsulotlar ──
      // Kod turlari: EAN-13 (zavod kodi) va ICH-xxxx (ichki kod, zavod kodi bo'lmaganlar)
      interface Namuna {
        nom: string
        barcode: string
        kategoriya: string
        unit: 'dona' | 'kg' | 'blok'
        costPrice: number
        salePrice: number
        minQty: number
        trackBatch: boolean
      }
      const namunalar: Namuna[] = [
        { nom: "Coca-Cola 1.5L", barcode: '4780000000011', kategoriya: 'Ichimliklar', unit: 'dona', costPrice: 9500, salePrice: 12000, minQty: 12, trackBatch: false },
        { nom: "Sut 1L", barcode: '4780000000028', kategoriya: 'Sut mahsulotlari', unit: 'dona', costPrice: 11000, salePrice: 14000, minQty: 10, trackBatch: true },
        { nom: "Guruch 1kg", barcode: '4780000000035', kategoriya: 'Guruch va makaron', unit: 'dona', costPrice: 14500, salePrice: 18000, minQty: 20, trackBatch: false },
        { nom: "O'simlik yog'i 1L", barcode: 'ICH-000004', kategoriya: 'Oziq-ovqat', unit: 'dona', costPrice: 21000, salePrice: 25000, minQty: 10, trackBatch: false },
        { nom: "Kruassan", barcode: 'ICH-000005', kategoriya: 'Qandolat', unit: 'dona', costPrice: 3500, salePrice: 5000, minQty: 6, trackBatch: true },
        { nom: "Ko'k choy 100g", barcode: 'ICH-000006', kategoriya: 'Ichimliklar', unit: 'dona', costPrice: 7000, salePrice: 9000, minQty: 8, trackBatch: false },
        { nom: "Guruch 1kg (blok/6 dona)", barcode: 'ICH-000007', kategoriya: 'Guruch va makaron', unit: 'blok', costPrice: 85000, salePrice: 102000, minQty: 3, trackBatch: false },
      ]

      let productId = 0
      for (let i = 0; i < namunalar.length; i++) {
        const n = namunalar[i]
        const id = await db.products.add({
          nom: n.nom,
          barcode: n.barcode,
          categoryId: katIds[n.kategoriya],
          unit: n.unit,
          costPrice: n.costPrice,
          salePrice: n.salePrice,
          minQty: n.minQty,
          trackBatch: n.trackBatch,
          labelType: n.barcode.startsWith('ICH-') ? 'code128' : 'ean13',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        productId = id as number

        // Mahsulotning asosiy kodi ham barcodes jadvaliga yoziladi —
        // skanerlashda qidiruv aynan shu jadvaldan o'tadi
        await db.barcodes.add({
          code: n.barcode,
          productId,
          multiplier: 1,
          note: 'asosiy kod',
        })
      }

      // ── Blok ↔ Dona bog'lanishi: 1 blok = 6 dona ──
      // Guruch (dona) va Guruch (blok) mahsulotlari orasidagi struktura
      const guruchDona = await db.products.where('barcode').equals('4780000000035').first()
      const guruchBlok = await db.products.where('barcode').equals('ICH-000007').first()
      if (guruchDona && guruchBlok) {
        await db.product_links.add({
          packProductId: guruchBlok.id!,
          unitProductId: guruchDona.id!,
          unitsPerPack: 6,
        })

        // DEMO — "blok kodi skanerlansa 6 dona qo'shilsin" talabini ko'rsatadi:
        // shu kod skanerlanganda savatga Guruch 1kg dan 6 dona tushadi.
        // (Do'konda haqiqiy blok zavod kodi shu tarzda qo'shiladi)
        await db.barcodes.add({
          code: 'BLK-000003',
          productId: guruchDona.id!,
          multiplier: 6,
          note: 'Blok kodi — 1 blok = 6 dona',
        })
      }
    },
  )
}

/**
 * Hujjat raqamlari hisoblagichlari — asosiy implementatsiya `counters.ts` da.
 * (Qulaylik uchun shu yerdan ham export qilinadi)
 */
export { nextDocNo } from './counters'
