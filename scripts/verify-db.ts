/**
 * Baza va seed tekshiruvi (smoke test).
 * Brauzersiz, Node muhitida soxta IndexedDB ustida ishlaydi.
 *
 * Ishga tushirish:  npm run verify
 *
 * Nima tekshiradi:
 *  1. Dexie sxemasi ochiladimi (noto'g'ri indeks bo'lsa shu yerda xato chiqadi)
 *  2. Seed barcha jadvallarga yoziladimi
 *  3. Hujjat raqamlari hisoblagichi (nextDocNo) to'g'ri ishlaydimi
 *  4. Qayta ishga tushirishda seed takrorlanmaydimi
 */
import 'fake-indexeddb/auto'
import { db } from '../src/db/database'
import { nextDocNo, runSeed } from '../src/db/seed'
import { resolveBarcode } from '../src/db/repo/productsRepo'
import {
  calcShiftSummary,
  cancelSale,
  closeShift,
  commitSale,
  getOpenShift,
  getSaleItems,
  listRecentSales,
  openShift,
} from '../src/db/repo/salesRepo'
import { createPurchase, createSupplier, getStockMap } from '../src/db/repo/stockRepo'

const natijalar: Array<{ jadval: string; bor: number; kutilgan: number }> = []

function tekshir(jadval: string, bor: number, kutilgan: number) {
  natijalar.push({ jadval, bor, kutilgan })
}

/**
 * Kassa oqimini tekshirish — POS sahifalari chaqiradigan repo funksiyalari.
 * Smena ochiladi → skaner kodi echiladi → savdo yoziladi → bekor qilinadi →
 * smena yopiladi. Barchasi soxta IndexedDB ustida.
 */
async function kassaOqimi() {
  const admin = (await db.users.where('login').equals('admin').first())!
  const userId = admin.id!

  // Smenasiz savdo bo'lmasligi kerak
  tekshir('kassa: smenasiz savdo bloklanadi', (await getOpenShift()) === null ? 1 : 0, 1)

  const BOSH = 100_000
  const shiftId = await openShift(BOSH, userId)
  tekshir('kassa: smena ochildi', (await getOpenShift())?.id === shiftId ? 1 : 0, 1)

  // Blok kodi skanerlansa — multiplier qo'llanishi kerak (1 blok = 6 dona)
  const blok = await resolveBarcode('BLK-000003')
  tekshir('kassa: blok kodi multiplier', blok?.qty === 6 ? 1 : 0, 1)

  const mahsulot = blok!.product
  const donaId = await db.products.where('barcode').equals(mahsulot.barcode).first()
  tekshir('kassa: blok → dona bog\'langan', !!donaId ? 1 : 0, 1)

  const qoldiq0 = (await getStockMap([donaId!.id!])).get(donaId!.id!) ?? 0

  // ── Avval tovar kiritamiz (seed'da qoldiq yo'q) ──
  const yetkazibBeruvchi = await createSupplier({ nom: 'Test Yetkazib Beruvchi' })
  await createPurchase({
    supplierId: yetkazibBeruvchi,
    date: Date.now(),
    lines: [{ productId: donaId!.id!, qty: 10, costPrice: 4000 }],
    paid: 40_000,
    userId,
  })
  const kirimQoldiq = (await getStockMap([donaId!.id!])).get(donaId!.id!) ?? 0
  tekshir(
    'kassa: kirimdan keyin qoldiq 10',
    Math.abs(kirimQoldiq - qoldiq0 - 10) < 0.001 ? 1 : 0,
    1,
  )

  // ── Naqd to'lovli savdo (qaytim bilan) ──
  const qator = { productId: donaId!.id!, qty: 2, unitPrice: 5000 }
  const jami = qator.qty * qator.unitPrice
  const savdo = await commitSale({
    lines: [qator],
    discount: 1000,
    payments: [{ method: 'cash', amount: jami - 1000, change: 3000 }],
    userId,
    shiftId,
  })
  tekshir('kassa: chek summasi to\'g\'ri', savdo.total === jami - 1000 ? 1 : 0, 1)

  const qoldiq1 = (await getStockMap([donaId!.id!])).get(donaId!.id!) ?? 0
  tekshir(
    'kassa: qoldiq 2 ta kamdi',
    Math.abs(kirimQoldiq - qoldiq1 - 2) < 0.001 ? 1 : 0,
    1,
  )

  const hisob = await calcShiftSummary(shiftId)
  tekshir('kassa: savdolar soni 1', hisob.salesCount === 1 ? 1 : 0, 1)
  tekshir(
    'kassa: kutilayotgan naqd',
    hisob.expectedCash === BOSH + (jami - 1000) ? 1 : 0,
    1,
  )

  // ── To'lov summasi chekga mos kelmasa — xato berilishi kerak ──
  let bloklandi = false
  try {
    await commitSale({
      lines: [qator],
      discount: 0,
      payments: [{ method: 'cash', amount: 1 }],
      userId,
      shiftId,
    })
  } catch {
    bloklandi = true
  }
  tekshir('kassa: noto\'g\'ri to\'lov bloklanadi', bloklandi ? 1 : 0, 1)

  // ── Qoldiq yetarli bo\'lsa — savdo bloklanishi kerak ──
  let qoldiqBloklandi = false
  try {
    await commitSale({
      lines: [{ ...qator, qty: 999_999 }],
      discount: 0,
      payments: [{ method: 'cash', amount: 999_999 * qator.unitPrice }],
      userId,
      shiftId,
    })
  } catch {
    qoldiqBloklandi = true
  }
  tekshir('kassa: qoldiq yetarli emas bloklanadi', qoldiqBloklandi ? 1 : 0, 1)

  // ── Tarix (POS "Tarix" yorlig'i) ──
  const tarix = await listRecentSales(200)
  tekshir('kassa: tarixda chek bor', tarix.some((s) => s.no === savdo.no) ? 1 : 0, 1)
  tekshir(
    'kassa: tarixda to\'lov turi bor',
    tarix.find((s) => s.no === savdo.no)?.payments[0]?.method === 'cash' ? 1 : 0,
    1,
  )
  const tarkib = await getSaleItems(savdo.saleId)
  tekshir('kassa: chek tarkibi', tarkib.length === 1 ? 1 : 0, 1)

  // ── Bekor qilish: tovar omborga qaytishi kerak ──
  await cancelSale(savdo.saleId, userId, 'void')
  const qoldiq2 = (await getStockMap([donaId!.id!])).get(donaId!.id!) ?? 0
  tekshir(
    'kassa: bekor qilishda qoldiq tiklandi',
    Math.abs(qoldiq2 - kirimQoldiq) < 0.001 ? 1 : 0,
    1,
  )

  const bekorHisob = await calcShiftSummary(shiftId)
  tekshir('kassa: bekor savdolar hisobga olinmaydi', bekorHisob.salesCount === 0 ? 1 : 0, 1)
  tekshir(
    'kassa: bekor naqdni ikki marta qisqarmaydi',
    bekorHisob.expectedCash === BOSH ? 1 : 0,
    1,
  )

  // ── Vozvrat: naqd kassadan chiqishi kerak ──
  const savdo2 = await commitSale({
    lines: [qator],
    discount: 0,
    payments: [{ method: 'card', amount: jami }],
    userId,
    shiftId,
  })
  await cancelSale(savdo2.saleId, userId, 'returned')
  const vozvratHisob = await calcShiftSummary(shiftId)
  tekshir(
    'kassa: kartali vozvrat naqdni o\'zgartirmaydi',
    vozvratHisob.expectedCash === BOSH ? 1 : 0,
    1,
  )

  const savdo3 = await commitSale({
    lines: [qator],
    discount: 0,
    payments: [{ method: 'cash', amount: jami }],
    userId,
    shiftId,
  })
  await cancelSale(savdo3.saleId, userId, 'returned')
  const naqdVozvrat = await calcShiftSummary(shiftId)
  tekshir(
    'kassa: naqdli vozvrat kassadan chiqadi',
    naqdVozvrat.expectedCash === BOSH - jami ? 1 : 0,
    1,
  )

  // ── Smena yopish: farq hisoblanadi ──
  const kutilayotgan = naqdVozvrat.expectedCash
  const yopilgan = await closeShift(kutilayotgan - 500, userId)
  tekshir('kassa: yopilgandan keyin smena yo\'q', (await getOpenShift()) === null ? 1 : 0, 1)
  tekshir('kassa: kamomad -500', yopilgan.diff === -500 ? 1 : 0, 1)
}

async function asosiy() {
  // ── 1. Baza ochiladi va seed ishlaydi ──
  await runSeed()

  tekshir('categories', await db.categories.count(), 6)
  tekshir('expense_categories', await db.expense_categories.count(), 6)
  tekshir('users', await db.users.count(), 1)
  tekshir('settings', await db.settings.count(), 6)
  tekshir('counters', await db.counters.count(), 4)
  tekshir('products', await db.products.count(), 7)
  // 7 ta asosiy kod + 1 ta blok kodi (multiplier=6)
  tekshir('barcodes', await db.barcodes.count(), 8)
  tekshir('product_links', await db.product_links.count(), 1)

  // ── 2. Blok ↔ dona bog'lanishi to'g'ri yozilganmi ──
  const link = await db.product_links.toCollection().first()
  const blokKodi = await db.barcodes.where('code').equals('BLK-000003').first()
  tekshir('product_links.unitsPerPack = 6', link?.unitsPerPack === 6 ? 1 : 0, 1)
  tekshir('barcodes.multiplier = 6', blokKodi?.multiplier === 6 ? 1 : 0, 1)

  // ── 3. Egasi paroli hashlanganmi (oddiy matn emas) ──
  const admin = await db.users.where('login').equals('admin').first()
  tekshir('parol hashlangan', admin && admin.passwordHash.length === 64 ? 1 : 0, 1)

  // ── 4. Hujjat raqamlari ketma-ket beriladimi ──
  const birinchi = await nextDocNo('sale_no')
  const ikkinchi = await nextDocNo('sale_no')
  tekshir('sale_no ketma-ket', birinchi === '000001' && ikkinchi === '000002' ? 1 : 0, 1)

  // ── 5. Qayta ishga tushirishda seed takrorlanmaydi ──
  await runSeed()
  tekshir('seed takrorlanmaydi (products)', await db.products.count(), 7)

  // ── 6. Kassa oqimi: smena → savdo → bekor → smena yopish ──
  await kassaOqimi()

  // ── Natija ──
  let xatolar = 0
  for (const n of natijalar) {
    const ok = n.bor === n.kutilgan
    if (!ok) xatolar++
    console.log(
      `${ok ? 'OK  ' : 'XATO'}  ${n.jadval.padEnd(34)} bor=${n.bor}  kutilgan=${n.kutilgan}`,
    )
  }

  console.log('-'.repeat(70))
  if (xatolar === 0) {
    console.log(`BARCHASI TO'G'RI — ${natijalar.length} tekshiruvdan o'tdi`)
  } else {
    console.log(`${xatolar} ta tekshiruv MUVAFFAQIYATSIZ`)
  }

  await db.delete() // test ma'lumotlarini tozalash
  process.exit(xatolar === 0 ? 0 : 1)
}

asosiy().catch((err) => {
  console.error('XATOLIK:', err)
  process.exit(1)
})
