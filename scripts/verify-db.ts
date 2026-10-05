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
import {
  deleteSupplier,
  listPurchasePayments,
  listSupplierPayments,
  listSupplierPurchases,
  listSupplierStats,
  payPurchase,
  totalDebt,
  updateSupplier,
} from '../src/db/repo/suppliersRepo'
import {
  createExpense,
  createExpenseCategory,
  deleteExpense,
  deleteExpenseCategory,
  listExpenses,
  sumExpenses,
  updateExpense,
} from '../src/db/repo/expensesRepo'

import {
  cashierStats,
  categoryStats,
  dailySeries,
  presetPeriod,
  productStats,
  profitSummary,
  shiftStats,
  stockValue,
} from '../src/db/repo/reportsRepo'

import {
  activeOwnerCount,
  changePassword,
  createUser,
  listUsers,
  setPassword,
  setUserActive,
  updateUser,
} from '../src/db/repo/usersRepo'
import {
  backupAgeText,
  exportBackup,
  getSetting,
  getSettings,
  importBackup,
  lowStockPercent,
  setSettings,
} from '../src/db/repo/settingsRepo'
import { verifyPassword } from '../src/db/crypto'
import { login } from '../src/hooks/useAuth'
import { purchaseReceiptHtml, saleReceiptHtml, shopFromSettings } from '../src/db/repo/receipt'
import { fmtMoney } from '../src/db/repo/helpers'

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

/** CHIQIMLAR oqimi: yozuv, kassadan chiqarish, tahrirlash, o'chirish */
async function chiqimOqimi() {
  const admin = (await db.users.where('login').equals('admin').first())!
  const userId = admin.id!

  const ijaralar = (await db.expense_categories.where('nom').equals('Ijara').first())!
  const kommunal = (await db.expense_categories.where('nom').equals('Kommunal').first())!

  // ── Oddiy yozuv (kassaga tegilmaydi) ──
  const yozuv = await createExpense({
    categoryId: ijaralar.id!,
    amount: 2_000_000,
    date: Date.now(),
    note: 'Oktabr ijara',
    userId,
  })
  tekshir('chiqim: yozuv yaratildi', (await db.expenses.get(yozuv))?.amount === 2_000_000 ? 1 : 0, 1)

  // Summa 0 yoki manfiy bo'lmasligi kerak
  let bloklandi = false
  try {
    await createExpense({ categoryId: ijaralar.id!, amount: 0, date: Date.now(), userId })
  } catch {
    bloklandi = true
  }
  tekshir('chiqim: 0 summa bloklanadi', bloklandi ? 1 : 0, 1)

  // ── Kassadan naqd chiqarish (smena talab qilinadi) ──
  let smenasizBloklandi = false
  try {
    await createExpense({
      categoryId: kommunal.id!,
      amount: 50_000,
      date: Date.now(),
      userId,
      fromCash: true,
    })
  } catch {
    smenasizBloklandi = true
  }
  tekshir('chiqim: smenasiz kassadan chiqarilmaydi', smenasizBloklandi ? 1 : 0, 1)

  const shiftId = await openShift(100_000, userId)
  const naqdChiqim = await createExpense({
    categoryId: kommunal.id!,
    amount: 50_000,
    date: Date.now(),
    note: 'Tok va suv',
    userId,
    fromCash: true,
    shiftId,
  })

  // Kassadagi pul kutilayotgan naqddan ayrilishi kerak
  const smena1 = await calcShiftSummary(shiftId)
  tekshir(
    'chiqim: kassadan chiqarish hisobga olinadi',
    smena1.expectedCash === 100_000 - 50_000 ? 1 : 0,
    1,
  )

  // cash_events ga bog'langan bo'lishi kerak (tahrirlash/o'chirish uchun)
  const boghangan = await db.cash_events
    .where('refType')
    .equals('expense')
    .and((e) => e.refId === naqdChiqim)
    .count()
  tekshir('chiqim: cash_event bog\'langan', boghangan === 1 ? 1 : 0, 1)

  // ── Tahrirlash: summa o'zgarganda kassadagi ta'sir ham yangilanadi ──
  await updateExpense(naqdChiqim, {
    categoryId: kommunal.id!,
    amount: 70_000,
    date: Date.now(),
    userId,
    fromCash: true,
    shiftId,
  })
  const smena2 = await calcShiftSummary(shiftId)
  tekshir(
    'chiqim: tahrirlashda kassa yangilandi',
    smena2.expectedCash === 100_000 - 70_000 ? 1 : 0,
    1,
  )
  tekshir(
    'chiqim: tahrirlashda cash_event yangilandi',
    (await db.cash_events.where('refType').equals('expense').and((e) => e.refId === naqdChiqim).count()) === 1
      ? 1
      : 0,
    1,
  )

  // ── "Kassadan" belgisini olib tashlash: kassaga ta'sir qolmasligi kerak ──
  await updateExpense(naqdChiqim, {
    categoryId: kommunal.id!,
    amount: 70_000,
    date: Date.now(),
    userId,
    fromCash: false,
  })
  const smena3 = await calcShiftSummary(shiftId)
  tekshir(
    'chiqim: kassadan olib tashlanganda to\'lanadi',
    smena3.expectedCash === 100_000 ? 1 : 0,
    1,
  )
  tekshir(
    'chiqim: cash_event o\'chirildi',
    (await db.cash_events.where('refType').equals('expense').and((e) => e.refId === naqdChiqim).count()) === 0
      ? 1
      : 0,
    1,
  )

  // ── Filtrlar va kategoriya nomlari ──
  const bugun = new Date()
  bugun.setHours(0, 0, 0, 0)
  const royxat = await listExpenses({ from: bugun.getTime() })
  tekshir('chiqim: bugungi filtr ishladi', royxat.length >= 2 ? 1 : 0, 1)
  tekshir(
    'chiqim: kategoriya nomi biriktirilgan',
    royxat.every((r) => r.categoryNom !== '—') ? 1 : 0,
    1,
  )
  tekshir(
    'chiqim: jami hisoblanadi',
    (await sumExpenses({ from: bugun.getTime() })) ===
      royxat.reduce((s, r) => s + r.amount, 0)
      ? 1
      : 0,
    1,
  )
  tekshir(
    'chiqim: kategoriya bo\'yicha filtr',
    (await listExpenses({ categoryId: kommunal.id! })).every((r) => r.categoryId === kommunal.id)
      ? 1
      : 0,
    1,
  )

  // ── Kategoriya: takrorlanmasin va ishlatilgani o'chirilmasin ──
  let dupBloklandi = false
  try {
    await createExpenseCategory('Ijara')
  } catch {
    dupBloklandi = true
  }
  tekshir('chiqim: takror kategoriya bloklanadi', dupBloklandi ? 1 : 0, 1)

  let ochirishBloklandi = false
  try {
    await deleteExpenseCategory(ijaralar.id!)
  } catch {
    ochirishBloklandi = true
  }
  tekshir('chiqim: ishlatilgan kategoriya o\'chirilmaydi', ochirishBloklandi ? 1 : 0, 1)

  const yangi = await createExpenseCategory('Reklama')
  tekshir('chiqim: yangi kategoriya qo\'shildi', !!yangi ? 1 : 0, 1)
  await deleteExpenseCategory(yangi)
  tekshir('chiqim: bo\'sh kategoriya o\'chirildi', (await db.expense_categories.get(yangi)) === undefined ? 1 : 0, 1)

  // ── Chiqimni o'chirish ──
  await deleteExpense(yozuv, userId)
  tekshir('chiqim: o\'chirildi', (await db.expenses.get(yozuv)) === undefined ? 1 : 0, 1)

  await closeShift(100_000, userId)
}

/**
 * HISOBOTLAR oqimi — ReportsPage chaqiradigan repo funksiyalari.
 * Ma'lum raqamlar bilan foyda, TOP mahsulot, kassir va ombor qiymati tekshiriladi.
 */
async function hisobotOqimi() {
  const admin = (await db.users.where('login').equals('admin').first())!
  const userId = admin.id!

  // Coca-Cola — kassa testida ishlatilmagan mahsulot (uning savdolari aralashmasin)
  const dona = (await db.products.where('barcode').equals('4780000000011').first())!
  const TANNARX = 4000
  const BOSH = 200_000

  // ── Ma'lumotni tozalash: chiqimlardan boshlaymiz (aniq summa tekshirish uchun) ──
  await db.expenses.clear()
  // Avvalgi testlardan qolgan savdo va smenalarni ham ko'ramiz ( chalkashmasin)
  const oldSaves = (await db.sales.toArray()).filter((x) => x.status === 'completed')

  // Yetkazib beruvchi + 10 dona kirim
  const yetkazibBeruvchi = await createSupplier({ nom: 'Hisobot Yetkazib Beruvchi' })
  await createPurchase({
    supplierId: yetkazibBeruvchi,
    date: Date.now(),
    lines: [{ productId: dona.id!, qty: 10, costPrice: TANNARX }],
    paid: 40_000,
    userId,
  })
  const kirimQoldiq = (await getStockMap([dona.id!])).get(dona.id!) ?? 0

  const shiftId = await openShift(BOSH, userId)

  // 1-savdo: 2 dona × 5000 = 10 000 (tannarx 8 000)
  await commitSale({
    lines: [{ productId: dona.id!, qty: 2, unitPrice: 5000 }],
    discount: 0,
    payments: [{ method: 'cash', amount: 10_000 }],
    userId,
    shiftId,
  })
  // 2-savdo: 1 dona × 6000 = 6 000 (tannarx 4 000)
  await commitSale({
    lines: [{ productId: dona.id!, qty: 1, unitPrice: 6000 }],
    discount: 0,
    payments: [{ method: 'cash', amount: 6_000 }],
    userId,
    shiftId,
  })
  // Bekor qilingan chek hisobotga KIRMASLIGI kerak (2 dona)
  const bekor = await commitSale({
    lines: [{ productId: dona.id!, qty: 2, unitPrice: 5000 }],
    discount: 0,
    payments: [{ method: 'cash', amount: 10_000 }],
    userId,
    shiftId,
  })
  await cancelSale(bekor.saleId, userId, 'void')

  // Chiqim: 3 000 so'm (bugungi sanada)
  const reklama = (await db.expense_categories.toArray())[0]
  await createExpense({
    categoryId: reklama.id!,
    amount: 3_000,
    date: Date.now(),
    note: 'hisobot testi',
    fromCash: false,
    userId,
  })

  const bugun = presetPeriod('today')
  tekshir(
    'hisobot: "bugun" davri bugunni qamraydi',
    bugun.from <= Date.now() && bugun.to >= Date.now() ? 1 : 0,
    1,
  )

  // ── Mening mahsulotim bo'yicha ANIQ raqamlar ──
  // tushum 16 000 · tannarx 12 000 · yalpi foyda 4 000 · 3 dona
  const oqimlar = await productStats(bugun, { sort: 'total' })
  const mening = oqimlar.find((x) => x.productId === dona.id!)!
  tekshir('hisobot: mahsulot kesimida topildi', !!mening ? 1 : 0, 1)
  tekshir('hisobot: mahsulot soni (3 dona)', mening?.qty === 3 ? 1 : 0, 1)
  tekshir('hisobot: mahsulot tushumi (16 000)', mening?.total === 16_000 ? 1 : 0, 1)
  tekshir('hisobot: mahsulot foydasi (4 000)', mening?.profit === 4_000 ? 1 : 0, 1)
  tekshir('hisobot: kategoriya nomi bor', mening?.categoryName !== '—' ? 1 : 0, 1)
  tekshir(
    'hisobot: bekor chek mahsulotga qo\'shilmaydi',
    (oqimlar.find((x) => x.productId === dona.id!)?.qty ?? 0) === 3 ? 1 : 0,
    1,
  )

  // ── Umumiy foyda: mening savdolarim + avvalgi testlarning savdolari ──
  const s = await profitSummary(bugun)
  const oldTotal = oldSaves.reduce((a, x) => a + x.total, 0)
  tekshir('hisobot: jami tushum', s.salesTotal === oldTotal + 16_000 ? 1 : 0, 1)
  tekshir('hisobot: cheklar soni', s.salesCount === oldSaves.length + 2 ? 1 : 0, 1)
  tekshir('hisobot: chiqimlar (faqat 3 000)', s.expensesTotal === 3_000 ? 1 : 0, 1)
  tekshir(
    'hisobot: yalpi foyda = tushum − tannarx',
    s.grossProfit === s.salesTotal - s.costTotal ? 1 : 0,
    1,
  )
  tekshir(
    'hisobot: sof foyda = yalpi − chiqim',
    s.netProfit === s.grossProfit - s.expensesTotal ? 1 : 0,
    1,
  )
  tekshir(
    'hisobot: o\'rtacha chek',
    s.avgCheck === Math.round(s.salesTotal / s.salesCount) ? 1 : 0,
    1,
  )
  tekshir('hisobot: naqd = umumiy tushum', s.cashSales === s.salesTotal ? 1 : 0, 1)
  tekshir('hisobot: karta tushum 0', s.cardSales === 0 ? 1 : 0, 1)
  tekshir('hisobot: bekor cheklar sanaladi', s.voidCount >= 1 ? 1 : 0, 1)

  // ── Kunlik qator: faqat bugungi kun ──
  const days = await dailySeries(bugun)
  tekshir('hisobot: kunlik qator bitta kun', days.length === 1 ? 1 : 0, 1)
  tekshir('hisobot: kunlik tushum = umumiy', days[0]?.salesTotal === s.salesTotal ? 1 : 0, 1)
  tekshir('hisobot: kunlik chiqim = 3 000', days[0]?.expensesTotal === 3_000 ? 1 : 0, 1)

  // ── Kategoriya ulushi: jami 100% ──
  const cats = await categoryStats(bugun)
  tekshir(
    'hisobot: kategoriyalar ulushi 100%',
    cats.reduce((a, c) => a + c.ulush, 0) === 100 ? 1 : 0,
    1,
  )

  // ── Kassir kesimida ──
  const kassir = await cashierStats(bugun)
  tekshir('hisobot: kassir ulushi 100%', kassir.reduce((a, c) => a + c.ulush, 0) === 100 ? 1 : 0, 1)
  tekshir(
    'hisobot: kassir tushumi = umumiy tushum',
    kassir.reduce((a, c) => a + c.salesTotal, 0) === s.salesTotal ? 1 : 0,
    1,
  )

  // ── Smena natijasi: kutilgan naqd faqat YOPILGANDA hisoblanadi ──
  const ochiq = (await shiftStats(bugun))[0]
  tekshir('hisobot: ochiq smena hali hisoblanmagan', ochiq?.expectedCash === 0 ? 1 : 0, 1)
  tekshir('hisobot: smena tushumi 16 000', ochiq?.salesTotal === 16_000 ? 1 : 0, 1)
  tekshir('hisobot: smena hali ochiq', ochiq?.status === 'open' ? 1 : 0, 1)

  await closeShift(BOSH + 16_000, userId)

  const yopiq = (await shiftStats(bugun))[0]
  tekshir('hisobot: smena kutilgan naqd', yopiq?.expectedCash === BOSH + 16_000 ? 1 : 0, 1)
  tekshir('hisobot: smena yopiq', yopiq?.status === 'closed' ? 1 : 0, 1)
  tekshir('hisobot: smena farqi 0', yopiq?.diff === 0 ? 1 : 0, 1)

  // ── Ombor qiymati: qoldiq 10 − 3 = 7 dona × 4000 = 28 000 ──
  const ombor = await stockValue()
  const qoldiq = (await getStockMap([dona.id!])).get(dona.id!) ?? 0
  tekshir('hisobot: qoldiq 7 dona', Math.abs(qoldiq - (kirimQoldiq - 3)) < 0.001 ? 1 : 0, 1)
  tekshir(
    'hisobot: ombor tannarx qiymati',
    (await stockValue()).costValue >= 7 * TANNARX ? 1 : 0,
    1,
  )
  tekshir(
    'hisobot: ombor foydasi retail−cost',
    ombor.expectedProfit === ombor.retailValue - ombor.costValue ? 1 : 0,
    1,
  )
  tekshir(
    'hisobot: ombor qiymati mahsulotlar ro\'yxatida',
    ombor.topValue.some((t) => t.nom === dona.nom && Math.abs(t.value - qoldiq * TANNARX) < 0.01)
      ? 1
      : 0,
    1,
  )

  // ── Davr chegarasi: kechagi kun hisobotga kirmaydi ──
  const kecha = await profitSummary({ from: bugun.from - 86400000, to: bugun.from - 1 })
  tekshir('hisobot: kecha hisobga kirmaydi', kecha.salesCount === 0 ? 1 : 0, 1)
  tekshir('hisobot: kechagi chiqimlar yo\'q', kecha.expensesTotal === 0 ? 1 : 0, 1)
}

/**
 * FOYDALANUVCHILAR oqimi — ro'ylar, parol, bloklash va xavfsizlik qoidalari.
 */
async function foydalanuvchiOqimi() {
  const admin = (await db.users.where('login').equals('admin').first())!
  const ownerId = admin.id!

  // ── Yangi kassir ──
  const kassirId = await createUser(
    { login: 'kassir1', password: '1234', fullName: 'Kassir Ali', role: 'cashier' },
    ownerId,
  )
  tekshir('foydalanuvchi: kassir qo\'shildi', kassirId > 0 ? 1 : 0, 1)

  const royxat = await listUsers()
  tekshir('foydalanuvchi: ro\'yxatda bor', royxat.some((u) => u.id === kassirId) ? 1 : 0, 1)
  tekshir('foydalanuvchi: egasi birinchi', royxat[0].role === 'owner' ? 1 : 0, 1)

  // Parol hash bilan saqlanadi (ochiq matn emas)
  const kassir = (await db.users.get(kassirId))!
  tekshir('foydalanuvchi: parol hashlangan', kassir.passwordHash.length === 64 ? 1 : 0, 1)
  tekshir('foydalanuvchi: parol saqlanmagan', kassir.passwordHash !== '1234' ? 1 : 0, 1)
  tekshir(
    'foydalanuvchi: parol to\'g\'ri tekshiriladi',
    (await verifyPassword('1234', kassir.passwordHash, kassir.salt)) ? 1 : 0,
    1,
  )
  tekshir(
    'foydalanuvchi: noto\'g\'ri parol rad etiladi',
    (await verifyPassword('9999', kassir.passwordHash, kassir.salt)) ? 0 : 1,
    1,
  )

  // ── Tizimga kirish ──
  tekshir('foydalanuvchi: login ishlaydi', (await login('kassir1', '1234')).ok ? 1 : 0, 1)
  tekshir('foydalanuvchi: noto\'g\'ri parol', (await login('kassir1', 'nope')).ok ? 0 : 1, 1)
  tekshir('foydalanuvchi: noma\'lum login', (await login('yoquser', '1234')).ok ? 0 : 1, 1)
  // Katta-kichik harf e'tiborsiz
  tekshir('foydalanuvchi: login kichik harfda', (await login('KASSIR1', '1234')).ok ? 1 : 0, 1)

  // ── Takrorlanmagan login ──
  let dupBloklandi = false
  try {
    await createUser({ login: 'kassir1', password: '1234', fullName: 'Nomi', role: 'cashier' }, ownerId)
  } catch {
    dupBloklandi = true
  }
  tekshir('foydalanuvchi: takror login bloklanadi', dupBloklandi ? 1 : 0, 1)

  // ── Xavfsizlik: oxirgi egasi o'zgartirilmaydi ──
  tekshir('foydalanuvchi: faol egasi 1', (await activeOwnerCount()) === 1 ? 1 : 0, 1)
  let oxirgiEgasiBloklandi = false
  try {
    await setUserActive(ownerId, false, ownerId)
  } catch {
    oxirgiEgasiBloklandi = true
  }
  tekshir('foydalanuvchi: oxirgi egasi bloklanmaydi', oxirgiEgasiBloklandi ? 1 : 0, 1)

  let rolBloklandi = false
  try {
    await updateUser(ownerId, { fullName: admin.fullName, role: 'cashier', isActive: true }, ownerId)
  } catch {
    rolBloklandi = true
  }
  tekshir('foydalanuvchi: oxirgi egasi kassirga aylantirilmaydi', rolBloklandi ? 1 : 0, 1)

  // ── Parolni o'zgartirish ──
  // O'zgartirish: eski parol majburiy (faqat o'zi uchun)
  let eskiParolNotogri = false
  try {
    await changePassword(kassirId, 'noto', '5678', kassirId)
  } catch {
    eskiParolNotogri = true
  }
  tekshir('foydalanuvchi: eski parol tekshiriladi', eskiParolNotogri ? 1 : 0, 1)

  await changePassword(kassirId, '1234', '5678', kassirId)
  tekshir('foydalanuvchi: yangi parol bilan kirish', (await login('kassir1', '5678')).ok ? 1 : 0, 1)
  tekshir('foydalanuvchi: eski parol ishlamaydi', (await login('kassir1', '1234')).ok ? 0 : 1, 1)

  // Egasi tayinlaydi: eski parolsiz
  await setPassword(kassirId, 'abcd', ownerId)
  tekshir('foydalanuvchi: parol tayinlash', (await login('kassir1', 'abcd')).ok ? 1 : 0, 1)

  // ── Bloklash ──
  await setUserActive(kassirId, false, ownerId)
  tekshir('foydalanuvchi: bloklangan kirmaydi', (await login('kassir1', 'abcd')).ok ? 0 : 1, 1)
  await setUserActive(kassirId, true, ownerId)
  tekshir('foydalanuvchi: blokdan chiqsa kirdi', (await login('kassir1', 'abcd')).ok ? 1 : 0, 1)

  // ── Rolni o'zgartirish ──
  await updateUser(kassirId, { fullName: 'Kassir A.', role: 'owner', isActive: true }, ownerId)
  tekshir('foydalanuvchi: rol o\'zgartirildi', (await db.users.get(kassirId))?.role === 'owner' ? 1 : 0, 1)
  tekshir('foydalanuvchi: faol egasi 2', (await activeOwnerCount()) === 2 ? 1 : 0, 1)

  // Endi egasi bloklanishi mumkin (kassir ham egasi bo'ldi)
  await setUserActive(ownerId, false, kassirId)
  tekshir('foydalanuvchi: ikkinchi egasi blokladi', (await db.users.get(ownerId))?.isActive === false ? 1 : 0, 1)
  await setUserActive(ownerId, true, kassirId)
}

/**
 * SOZLAMALAR va ZAXIRA oqimi.
 */
async function sozlamalarOqimi() {
  const admin = (await db.users.where('login').equals('admin').first())!
  const ownerId = admin.id!

  // ── O'qish / yozish ──
  const barchasi = await getSettings()
  tekshir('sozlama: standart kalitlar bor', barchasi.shop_name.length > 0 ? 1 : 0, 1)

  await setSettings({ shop_name: 'Test Do\'kon', phone: '+998900000000', low_stock_percent: '30' })
  tekshir('sozlama: nom saqlandi', (await getSetting('shop_name')) === "Test Do'kon" ? 1 : 0, 1)
  tekshir('sozlama: telefon saqlandi', (await getSetting('phone')) === '+998900000000' ? 1 : 0, 1)
  tekshir('sozlama: faqat o\'zgaruvchi qiymat', (await getSettings()).shop_name === "Test Do'kon" ? 1 : 0, 1)

  // ── Kam qoldiq foizi ──
  tekshir('sozlama: foiz 30', lowStockPercent('30') === 30 ? 1 : 0, 1)
  tekshir('sozlama: foiz chegarasi 100', lowStockPercent('300') === 100 ? 1 : 0, 1)
  tekshir('sozlama: noto\'g\'ri foiz → standart', lowStockPercent('abc') === 20 ? 1 : 0, 1)

  // ── Zaxira yoshi ──
  tekshir('sozlama: zaxira yo\'q → ogohlantirish', backupAgeText('').ogohlantirish ? 1 : 0, 1)
  tekshir('sozlama: bugungi zaxira', backupAgeText(String(Date.now())).oghlantirish ? 0 : 1, 1)
  tekshir(
    'sozlama: 10 kunlik zaxira ogohlantiradi',
    backupAgeText(String(Date.now() - 10 * 86400000)).ogohlantirish ? 1 : 0,
    1,
  )

  // ── Zaxira fayl (eksport) ──
  const zaxira = await exportBackup()
  tekshir('zaxira: ilova nomi', zaxira.app === 'dokon-crm' ? 1 : 0, 1)
  tekshir('zaxira: jadvallar bo\'sh emas', Object.keys(zaxira.tables).length > 20 ? 1 : 0, 1)
  tekshir('zaxira: mahsulotlar kiritilgan', (zaxira.tables.products?.length ?? 0) === 7 ? 1 : 0, 1)
  tekshir('zaxira: foydalanuvchilar kiritilgan', (zaxira.tables.users?.length ?? 0) >= 2 ? 1 : 0, 1)

  // ── Noto'g'ri fayllar rad etiladi ──
  tekshir('zaxira: boshqa dastur fayli', (await importBackup({ app: 'boshqa' }, ownerId)).ok ? 0 : 1, 1)
  tekshir('zaxira: bo\'sh obyekt', (await importBackup(null, ownerId)).ok ? 0 : 1, 1)
  tekshir(
    'zaxira: foydalanuvchisiz fayl',
    (await importBackup({ app: 'dokon-crm', version: 1, tables: {} }, ownerId)).ok ? 0 : 1,
    1,
  )
  tekshir(
    'zaxira: kelajak versiyasi',
    (await importBackup({ app: 'dokon-crm', version: 99, tables: zaxira.tables }, ownerId)).ok ? 0 : 1,
    1,
  )
  tekshir('zaxira: rad etilgandan keyin bazaga tegilmedi', (await db.products.count()) === 7 ? 1 : 0, 1)

  // ── Import (tiklash) ──
  await db.products.put({
    nom: 'Sinov mahsuloti',
    barcode: 'TEST-999',
    categoryId: 1,
    unit: 'dona',
    qty: 0,
    costPrice: 1000,
    salePrice: 1500,
    minQty: 0,
    isActive: true,
    trackBatch: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
  tekshir('zaxira: sinov mahsuloti qo\'shildi', (await db.products.count()) === 8 ? 1 : 0, 1)

  const tiklash = await importBackup(zaxira, ownerId)
  tekshir('zaxira: import muvaffaqiyatli', tiklash.ok ? 1 : 0, 1)
  tekshir('zaxira: mahsulotlar soni tiklandi', (await db.products.count()) === 7 ? 1 : 0, 1)
  tekshir('zaxira: sinov mahsuloti yo\'qoldi', (await db.products.where('barcode').equals('TEST-999').first()) === undefined ? 1 : 0, 1)
  tekshir('zaxira: sozlamalar tiklandi', (await getSetting('shop_name')) === "Test Do'kon" ? 1 : 0, 1)
  tekshir('zaxira: foydalanuvchilar tiklandi', (await db.users.count()) >= 2 ? 1 : 0, 1)
}

/**
 * YETKAZIB BERUVCHILAR va QARZ NAZORATI oqimi.
 *  — statistika (olgan / to'lagan / qarz)
 *  — qarzli kirim, to'lov tarixi
 *  — kassadan to'lov smena naqdimini kamaytirishi
 *  — chegaralar: to'lov kirimdan ko'p bo'lmaydi, yopiq smenadan to'lanmaydi
 */
async function yetkazibBeruvchiOqimi() {
  const admin = (await db.users.where('login').equals('admin').first())!
  const userId = admin.id!
  // Mahsulot yaratmaymiz (keyingi zaxira testi 7 ta mahsulot kutiladi)
  const mahsulot = (await db.products.orderBy('id').first())!

  // ── 1. Ro'yxat va statistika ──
  const sid = await createSupplier({ nom: 'Qarz Nazorati YB', telefon: '+998 90 000 11 22' })
  let stats = await listSupplierStats()
  let row = stats.find((s) => s.id === sid)!
  tekshir('yb: statistikada bor', !!row && row.debt === 0 && row.purchasesCount === 0 ? 1 : 0, 1)
  tekshir(
    'yb: statistika qarzi bo\'yicha kamaygan tartibda',
    stats.every((s, i) => i === 0 || stats[i - 1].debt >= s.debt) ? 1 : 0,
    1,
  )

  // ── 2. Qarzli kirim (to'lanmagan) ──
  const kirimId = await createPurchase({
    supplierId: sid,
    date: Date.now(),
    lines: [{ productId: mahsulot.id!, qty: 5, costPrice: 10_000 }],
    paid: 0,
    userId,
  })
  const kirim = (await db.purchases.get(kirimId))!
  tekshir('yb: kirim jami 50 000', kirim.total === 50_000 ? 1 : 0, 1)
  tekshir(
    'yb: to\'lanmagan kirimda to\'lov yozuvi yo\'q',
    (await db.purchase_payments.where('purchaseId').equals(kirimId).count()) === 0 ? 1 : 0,
    1,
  )
  row = (await listSupplierStats()).find((s) => s.id === sid)!
  tekshir('yb: statistika qarzi 50 000', row.debt === 50_000 && row.totalPaid === 0 ? 1 : 0, 1)
  tekshir('yb: statistika olgan summasi', row.totalPurchased === 50_000 ? 1 : 0, 1)
  tekshir('yb: mahsulot xili sanaldi', row.productsCount === 1 ? 1 : 0, 1)
  tekshir('yb: umumiy qarz hisoblandi', (await totalDebt()).qarz >= 50_000 ? 1 : 0, 1)

  // ── 3. Chegaralar: to'lov kirim summasidan ko'p bo'lmaydi ──
  let bloklandi = false
  try {
    await createPurchase({
      supplierId: sid,
      date: Date.now(),
      lines: [{ productId: mahsulot.id!, qty: 1, costPrice: 1000 }],
      paid: 5000,
      userId,
    })
  } catch {
    bloklandi = true
  }
  tekshir('yb: kirimdan ko\'p to\'lov bloklanadi', bloklandi ? 1 : 0, 1)

  // ── 4. Smena ochiq emas — kassadan to'lash bloklanadi ──
  tekshir('yb: test boshida smena yopiq', (await getOpenShift()) === null ? 1 : 0, 1)
  bloklandi = false
  try {
    await payPurchase({
      purchaseId: kirimId,
      amount: 1000,
      method: 'cash',
      fromCash: true,
      shiftId: 999_999,
      userId,
    })
  } catch {
    bloklandi = true
  }
  tekshir('yb: smenasiz kassadan to\'lov bloklanadi', bloklandi ? 1 : 0, 1)

  // ── 5. Smena ochamiz va kassadan to'laymiz ──
  const shiftId = await openShift(300_000, userId)
  const oldin = await calcShiftSummary(shiftId)
  await payPurchase({
    purchaseId: kirimId,
    amount: 20_000,
    method: 'cash',
    fromCash: true,
    shiftId,
    userId,
  })
  tekshir(
    'yb: kassadan to\'lov smena naqdimini kamaytirdi',
    (await calcShiftSummary(shiftId)).expectedCash === oldin.expectedCash - 20_000 ? 1 : 0,
    1,
  )
  tekshir(
    'yb: purchase_payments yozuvi saqlandi',
    (await listPurchasePayments(kirimId)).length === 1 ? 1 : 0,
    1,
  )
  tekshir(
    'yb: to\'langan summa yangilandi',
    (await db.purchases.get(kirimId))!.paid === 20_000 ? 1 : 0,
    1,
  )
  tekshir(
    'yb: cash_out kassa harakati yozildi',
    (await db.cash_events.where('refType').equals('purchase').count()) >= 1 ? 1 : 0,
    1,
  )
  tekshir(
    'yb: to\'lov kassadan bog\'langan',
    (await listPurchasePayments(kirimId))[0]?.fromCash === true ? 1 : 0,
    1,
  )

  // ── 6. Kassadan tashqaridagi to'lov (karta) kassa harakati yaratmasin ──
  const oldin2 = await calcShiftSummary(shiftId)
  await payPurchase({
    purchaseId: kirimId,
    amount: 10_000,
    method: 'card',
    fromCash: false,
    userId,
  })
  tekshir(
    'yb: kartali to\'lov kassani tegilmaydi',
    (await calcShiftSummary(shiftId)).expectedCash === oldin2.expectedCash ? 1 : 0,
    1,
  )
  tekshir(
    'yb: ikkinchi to\'lov yozuvi qo\'shildi',
    (await listPurchasePayments(kirimId)).length === 2 ? 1 : 0,
    1,
  )

  // ── 7. Qarz chegarasidan oshish bloklanadi ──
  bloklandi = false
  try {
    await payPurchase({ purchaseId: kirimId, amount: 999_999, method: 'cash', userId })
  } catch {
    bloklandi = true
  }
  tekshir('yb: qarzdan ko\'p to\'lov bloklanadi', bloklandi ? 1 : 0, 1)
  bloklandi = false
  try {
    await payPurchase({ purchaseId: kirimId, amount: 0, method: 'cash', userId })
  } catch {
    bloklandi = true
  }
  tekshir('yb: nol to\'lov bloklanadi', bloklandi ? 1 : 0, 1)

  // ── 8. Qarzni to'liq yopamiz, keyin to'lash bloklanadi ──
  await payPurchase({ purchaseId: kirimId, amount: 20_000, method: 'cash', userId })
  tekshir(
    'yb: qarz to\'liq yopildi',
    (await db.purchases.get(kirimId))!.paid === 50_000 ? 1 : 0,
    1,
  )
  row = (await listSupplierStats()).find((s) => s.id === sid)!
  tekshir('yb: statistikada qarz yo\'q', row.debt === 0 ? 1 : 0, 1)
  bloklandi = false
  try {
    await payPurchase({ purchaseId: kirimId, amount: 1000, method: 'cash', userId })
  } catch {
    bloklandi = true
  }
  tekshir('yb: qarzsiz kirimga to\'lov bloklanadi', bloklandi ? 1 : 0, 1)

  // ── 9. Yetkazib beruvchi bo'yicha ro'yxatlar ──
  const ybKirimlar = await listSupplierPurchases(sid)
  tekshir('yb: yetkazib beruvchi kirimlari', ybKirimlar.length === 1 && ybKirimlar[0].debt === 0 ? 1 : 0, 1)
  tekshir(
    'yb: yetkazib beruvchi to\'lovlari tarixi',
    (await listSupplierPayments(sid)).length === 3 ? 1 : 0,
    1,
  )

  // ── 10. Yetkazib beruvchini tahrirlash (nom unikal) ──
  await updateSupplier(sid, { nom: 'Qarz Nazorati YB (yangilangan)' }, userId)
  tekshir(
    'yb: tahrirlash saqlandi',
    (await db.suppliers.get(sid))!.nom === 'Qarz Nazorati YB (yangilangan)' ? 1 : 0,
    1,
  )
  bloklandi = false
  try {
    await updateSupplier(sid, { nom: 'Test Yetkazib Beruvchi' }, userId)
  } catch {
    bloklandi = true
  }
  tekshir('yb: takroriy nom bloklanadi', bloklandi ? 1 : 0, 1)

  // ── 11. Kirimi bor yetkazib beruvchini o'chirib bo'lmaydi ──
  bloklandi = false
  try {
    await deleteSupplier(sid, userId)
  } catch {
    bloklandi = true
  }
  tekshir('yb: kirimi bor YB o\'chirilmaydi', bloklandi ? 1 : 0, 1)

  // ── 12. Bo'sh yetkazib beruvchini o'chirish mumkin ──
  const boshid = await createSupplier({ nom: 'O\'chiriladigan YB' })
  await deleteSupplier(boshid, userId)
  tekshir('yb: bo\'sh YB o\'chiriladi', (await db.suppliers.get(boshid)) === undefined ? 1 : 0, 1)

  // ── 13. Yopiq smenadan kassadan to'lov bloklanadi ──
  const yopiqSmenali = await createSupplier({ nom: 'Yopiq Smena YB' })
  const kirim2 = await createPurchase({
    supplierId: yopiqSmenali,
    date: Date.now(),
    lines: [{ productId: mahsulot.id!, qty: 1, costPrice: 5_000 }],
    paid: 0,
    userId,
  })
  await closeShift((await calcShiftSummary(shiftId)).expectedCash, userId)
  bloklandi = false
  try {
    await payPurchase({
      purchaseId: kirim2,
      amount: 1000,
      method: 'cash',
      fromCash: true,
      shiftId,
      userId,
    })
  } catch {
    bloklandi = true
  }
  tekshir('yb: yopiq smenadan to\'lov bloklanadi', bloklandi ? 1 : 0, 1)
}

/**
 * CHEK CHOP ETISH — HTML generator to'gri chiqadimi.
 * (Chop etish brauzerda ishlaydi, shuning uchun matn sinovi yetarli.)
 */
async function chekOqimi() {
  const admin = (await db.users.where('login').equals('admin').first())!
  const mahsulot = (await db.products.orderBy('id').first())!

  // ── Sotuv cheki ──
  const savdo = await commitSale({
    lines: [{ productId: mahsulot.id!, qty: 2, unitPrice: 5000 }],
    discount: 1000,
    payments: [{ method: 'cash', amount: 9000, change: 1000 }],
    userId: admin.id!,
    shiftId: await currentOrNewShift(admin.id!),
  })
  const chek = saleReceiptHtml({
    sale: {
      id: savdo.saleId,
      no: savdo.no,
      datetime: savdo.datetime,
      userId: admin.id!,
      shiftId: 1,
      subtotal: 10_000,
      discount: 1000,
      total: 9000,
      costTotal: 4000,
      status: 'completed',
    },
    items: [
      {
        id: 1,
        saleId: savdo.saleId,
        productId: mahsulot.id!,
        qty: 2,
        unitPrice: 5000,
        costPrice: 4000,
        discount: 0,
        lineTotal: 10_000,
        productNom: mahsulot.nom,
      },
    ],
    payments: [{ saleId: savdo.saleId, method: 'cash', amount: 9000, change: 1000 }],
    cashier: 'Admin',
    shop: { shop_name: "Test do'kon", address: 'Toshkent', phone: '+998 90 000 00 00' },
  })

  tekshir('chek: to\'liq HTML hujjat', chek.startsWith('<!doctype html>') && chek.includes('</html>') ? 1 : 0, 1)
  tekshir('chek: do\'kon nomi chiqdi', chek.includes("Test do'kon") ? 1 : 0, 1)
  tekshir('chek: manzil va telefon', chek.includes('Toshkent') && chek.includes('+998 90 000 00 00') ? 1 : 0, 1)
  tekshir('chek: chek raqami chiqdi', chek.includes(savdo.no) ? 1 : 0, 1)
  tekshir('chek: mahsulot nomi chiqdi', chek.includes(mahsulot.nom) ? 1 : 0, 1)
  tekshir('chek: qator summasi 10 000', chek.includes(fmtMoney(10_000)) ? 1 : 0, 1)
  tekshir('chek: chegirma ko\'rsatildi', chek.includes('Chegirma') ? 1 : 0, 1)
  tekshir('chek: to\'lovsummasi 9 000', chek.includes(fmtMoney(9000)) ? 1 : 0, 1)
  tekshir('chek: qaytim ko\'rsatildi', chek.includes('Qaytim') ? 1 : 0, 1)
  tekshir('chek: tor o\'lcham (80 mm)', chek.includes('width: 76mm') ? 1 : 0, 1)
  tekshir('chek: bekor belgisi yo\'q', !chek.includes('BEKOR QILINGAN') ? 1 : 0, 1)

  // Bekor qilingan chek — maxsus belgi bilan
  await cancelSale(savdo.saleId, admin.id!, 'void')
  const bekorChek = saleReceiptHtml({
    sale: {
      id: savdo.saleId,
      no: savdo.no,
      datetime: savdo.datetime,
      userId: admin.id!,
      shiftId: 1,
      subtotal: 10_000,
      discount: 1000,
      total: 9000,
      costTotal: 4000,
      status: 'void',
    },
    items: [],
    payments: [],
    cashier: 'Admin',
  })
  tekshir('chek: bekor qilinganlik belgisi', bekorChek.includes('BEKOR QILINGAN') ? 1 : 0, 1)
  tekshir('chek: bekor sarlavhasi', bekorChek.includes('CHEK (BEKOR QILINGAN)') ? 1 : 0, 1)

  // ── Xavfsizlik: mahsulot nomidagi HTML neytral bo'lishi kerak ──
  const xavfsiz = saleReceiptHtml({
    sale: {
      id: 1,
      no: '000001',
      datetime: Date.now(),
      userId: admin.id!,
      shiftId: 1,
      subtotal: 100,
      discount: 0,
      total: 100,
      costTotal: 50,
      status: 'completed',
    },
    items: [
      {
        id: 1,
        saleId: 1,
        productId: 1,
        qty: 1,
        unitPrice: 100,
        costPrice: 50,
        discount: 0,
        lineTotal: 100,
        productNom: '<script>alert(1)</script>',
      },
    ],
    payments: [{ saleId: 1, method: 'cash', amount: 100 }],
    cashier: '<b>Admin</b>',
  })
  tekshir('chek: HTML injeksiyasi bloklanadi', !xavfsiz.includes('<script>alert') ? 1 : 0, 1)
  tekshir('chek: kassir nomi ham escape qilinadi', !xavfsiz.includes('<b>Admin</b>') ? 1 : 0, 1)

  // ── Kirim hujjati ──
  const sid = await createSupplier({ nom: 'Chek Yetkazib Beruvchi' })
  const kirimId = await createPurchase({
    supplierId: sid,
    date: Date.now(),
    lines: [{ productId: mahsulot.id!, qty: 3, costPrice: 4000 }],
    paid: 5000,
    userId: admin.id!,
  })
  const kirim = (await db.purchases.get(kirimId))!
  const kirimItems = await db.purchase_items.where('purchaseId').equals(kirimId).toArray()
  const hujjat = purchaseReceiptHtml({
    purchase: kirim,
    items: kirimItems.map((i) => ({ ...i, productNom: mahsulot.nom })),
    payments: await listPurchasePayments(kirimId),
    supplierNom: 'Chek Yetkazib Beruvchi',
    shop: { shop_name: "Test do'kon" },
  })
  tekshir('chek: kirim hujjati HTML', hujjat.startsWith('<!doctype html>') ? 1 : 0, 1)
  tekshir('chek: kirim yetkazib beruvchi', hujjat.includes('Chek Yetkazib Beruvchi') ? 1 : 0, 1)
  tekshir('chek: kirim qarzi 7 000', hujjat.includes(fmtMoney(7000)) ? 1 : 0, 1)
  tekshir('chek: kirim to\'lovi 5 000', hujjat.includes(fmtMoney(5000)) ? 1 : 0, 1)

  // ── Sozlamadan do'kon ma'lumotlari ──
  await setSettings({ shop_name: "Chek Do'kon", address: 'Andijon', phone: '+998 90 111 22 33' })
  const shop = shopFromSettings(await db.settings.toArray())
  tekshir(
    'chek: sozlamalar chekka o\'tkazildi',
    shop.shop_name === "Chek Do'kon" && shop.address === 'Andijon' ? 1 : 0,
    1,
  )
}

/** Ochiq smena id'si (yo'q bo'lsa ochadi) */
async function currentOrNewShift(userId: number): Promise<number> {
  const ochiq = await getOpenShift()
  if (ochiq?.id) return ochiq.id
  return openShift(500_000, userId)
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

  // ── 7. Chiqimlar oqimi ──
  await chiqimOqimi()

  // ── 8. Hisobotlar oqimi ──
  await hisobotOqimi()

  // ── 9. Foydalanuvchilar va ruxsatlar ──
  await foydalanuvchiOqimi()

  // ── 10. Yetkazib beruvchilar va qarz nazorati ──
  await yetkazibBeruvchiOqimi()

  // ── 11. Chek chop etish ──
  await chekOqimi()

  // ── 12. Sozlamalar va zaxira nusxa ──
  await sozlamalarOqimi()

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
