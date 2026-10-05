# Do'kon boshqaruvi — Kassa + Ombor + Moliya

Oziq-ovqat do'koni uchun to'liq boshqaruv tizimi.
**Server va internet shart emas** — barcha ma'lumot kompyuter brauzerida (IndexedDB) saqlanadi.

- Texnologiya: **React + TypeScript + Vite**
- Baza: **Dexie (IndexedDB)** — oflayn, 100% lokal
- Stil: **Tailwind CSS v4**

## Ishga tushirish

```powershell
npm install     # birinchi marta
npm run dev     # http://localhost:5173
```

**Birinchi kirish:** `admin` / `admin123`

## Buyruqlar

| Buyruq | Nima qiladi |
|---|---|
| `npm run dev` | Ishlab chiqarish (dev) rejimi — http://localhost:5173 |
| `npm run build` | Tayyor fayllarni `dist/` ga yig'ish |
| `npm run preview` | Tayyorlangan `dist/` ni ko'rish |
| `npm run lint` | Kod tekshiruvi (oxlint) |
| `npm run verify` | Baza sxemasi va biznes-mantiq tekshiruvi (185 ta test) |

> **Muhim:** `crypto.subtle` (parol hash) faqat `localhost` yoki `https` da ishlaydi.
> Shuning uchun ilovani doim `npm run dev` orqali oching.

## Loyiha tuzilmasi

```
src/
├─ db/
│  ├─ database.ts     ← Dexie sxemasi (22 jadval, indekslar, v2 migratsiya)
│  ├─ seed.ts         ← boshlang'ich ma'lumotlar + hujjat raqamlari
│  ├─ crypto.ts       ← parolni SHA-256 + tuz bilan hashlash
│  └─ repo/           ← mantiq: sales, stock, suppliers, expenses, reports,
│                        users, settings, audit, export, receipt
├─ types/index.ts     ← barcha jadvallar tip'lari
├─ hooks/
│  ├─ useAuth.ts          ← kirish/chiqish, ruxsatlar, audit jurnali
│  └─ useBarcodeScanner.ts ← shtrix-kod skaneri (klaviatura-wedge)
├─ stores/authStore.ts ← joriy foydalanuvchi (Zustand + persist)
├─ components/        ← Layout, RequireAuth/RequireRole, Modal, chek tugmalari
└─ pages/             ← Login, pos, warehouse, products, expenses, reports,
                        users, settings
```

## Ma'lumotlar bazasi

`F12` → **Application** → **IndexedDB** → `dokon_crm` — barcha jadvallar shu yerda.

**Qoldiq qanday hisoblanadi:** `stock_movements` jurnalidan `SUM(qty)`.
Har bir kirim/sotuv/chiqarish shu jurnalga yoziladi — tarix to'liq saqlanadi.

**Qarz nazorati:** har bir kirim bo'yicha `purchase_payments` jadvalidagi to'lov
tarixi saqlanadi. Kassadan berilgan to'lov `cash_events`ga `cash_out` sifatida
yoziladi, ya'ni smena yopilganda kutilayotgan naqd to'g'ri chiqadi.

## Zaxira nusxa (muhim!)

Brauzer ma'lumotlari tozalinsa (kesh tozalash, boshqa brauzerga o'tish) baza yo'qoladi.

**Sozlamalar → Zaxira nusxa** orqali bir tugma bilan JSON fayl yuklab oling
(bo'sh qoldirsa 10 kunlik ogohlantirish chiqadi). Faylni `npm run dev` serveriga
qayta import qilish mumkin.

## Chek chop etish

Savdo yakunlangach **"Chekni chop etish"** — 80 mm termal printer uchun
alohida oynada chiqadi (iFrame orqali, popup bloklanmaydi). "Save as PDF"
orqali PDF ham olish mumkin. Yetkazib beruvchi hujjati ham
**Kirimlar → Hujjatni chop etish** orqali chiqadi.

## Bosqichlar

- [x] **Bosqich 0–1** — skelet, login, baza sxemasi, seed
- [x] **Bosqich 2** — mahsulotlar (CRUD, kodlar, etiketka)
- [x] **Bosqich 3** — ombor (kirim, qoldiq, inventarizatsiya)
- [x] **Bosqich 4** — kassa (savat, to'lov, smena)
- [x] **Bosqich 5** — chiqimlar
- [x] **Bosqich 6** — hisobotlar + Excel/PDF export
- [x] **Bosqich 7** — ruxsatlar, jurnal, zaxira nusxa
- [x] **Bosqich 8** — yetkazib beruvchilar va qarz nazorati
- [x] **Bosqich 9** — chek va hujjat chop etish (80 mm)
