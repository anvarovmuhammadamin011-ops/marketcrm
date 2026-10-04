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
| `npm run verify` | Baza sxemasi va seed tekshiruvi (13 ta test) |

> **Muhim:** `crypto.subtle` (parol hash) faqat `localhost` yoki `https` da ishlaydi.
> Shuning uchun ilovani doim `npm run dev` orqali oching.

## Loyiha tuzilmasi

```
src/
├─ db/
│  ├─ database.ts     ← Dexie sxemasi (20+ jadval, indekslar)
│  ├─ seed.ts         ← boshlang'ich ma'lumotlar + hujjat raqamlari
│  └─ crypto.ts       ← parolni SHA-256 + tuz bilan hashlash
├─ types/index.ts     ← barcha jadvallar tip'lari
├─ hooks/
│  ├─ useAuth.ts          ← kirish/chiqish, ruxsatlar, audit jurnali
│  └─ useBarcodeScanner.ts ← shtrix-kod skaneri (klaviatura-wedge)
├─ stores/authStore.ts ← joriy foydalanuvchi (Zustand + persist)
├─ components/        ← Layout (menyu), RequireAuth (himoya)
└─ pages/             ← Login, Placeholder (keyingi bosqichlar)
```

## Ma'lumotlar bazasi

`F12` → **Application** → **IndexedDB** → `dokon_crm` — barcha jadvallar shu yerda.

**Qoldiq qanday hisoblanadi:** `stock_movements` jurnalidan `SUM(qty)`.
Har bir kirim/sotuv/chiqarish shu jurnalga yoziladi — tarix to'liq saqlanadi.

## Zaxira nusxa (muhim!)

Brauzer ma'lumotlari tozalansa (kesh tozalash, boshqa brauzerga o'tish) baza yo'qoladi.
**Har hafta** zaxira nusxa oling (Bosqich 7 da avtomatik tugma qo'shiladi),
hozircha brauzer orqali: F12 → Application → IndexedDB → `dokon_crm` → export.

## Oshxonalar (bosqichlar)

- [x] **Bosqich 0–1** — skelet, login, baza sxemasi, seed
- [ ] **Bosqich 2** — mahsulotlar (CRUD, kodlar, etiketka)
- [ ] **Bosqich 3** — ombor (kirim, qoldiq, inventarizatsiya)
- [ ] **Bosqich 4** — kassa (savat, to'lov, smena)
- [ ] **Bosqich 5** — chiqimlar
- [ ] **Bosqich 6** — hisobotlar + Excel/PDF export
- [ ] **Bosqich 7** — ruxsatlar, jurnal, zaxira nusxa
