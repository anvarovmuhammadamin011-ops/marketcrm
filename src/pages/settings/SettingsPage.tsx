import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ErrorBox } from '../../components/ui/Modal'
import { download } from '../../db/repo/export'
import { fmtDateTime } from '../../db/repo/helpers'
import { logAudit, listAuditLog, type AuditRow } from '../../db/repo/auditRepo'
import {
  backupAgeText,
  exportBackup,
  getSettings,
  importBackup,
  lowStockPercent,
  markBackupDone,
  setSettings,
  tableStats,
} from '../../db/repo/settingsRepo'
import { changePassword } from '../../db/repo/usersRepo'
import { useCurrentUser } from '../../hooks/useAuth'

/** SOZLAMALAR — do'kon ma'lumotlari, parol va zaxira nusxa */
export default function SettingsPage() {
  const me = useCurrentUser()
  const uid = me?.id

  const sozlamalar = useLiveQuery(() => getSettings(), [], null)
  const statistika = useLiveQuery(() => tableStats(), [], [])
  const audit = useLiveQuery<AuditRow[], never[]>(() => listAuditLog(8), [], [])

  const [shop, setShop] = useState({ shop_name: '', address: '', phone: '' })
  const [lowStock, setLowStock] = useState('20')
  const [shopError, setShopError] = useState('')
  const [shopOk, setShopOk] = useState('')
  const [shopBusy, setShopBusy] = useState(false)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [passError, setPassError] = useState('')
  const [passOk, setPassOk] = useState('')
  const [passBusy, setPassBusy] = useState(false)

  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const [backupError, setBackupError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Bazadagi qiymatlarni shaklga ko'chirish (bir marta — mountda)
  useEffect(() => {
    if (!sozlamalar) return
    setShop({
      shop_name: sozlamalar.shop_name,
      address: sozlamalar.address,
      phone: sozlamalar.phone,
    })
    setLowStock(sozlamalar.low_stock_percent)
  }, [sozlamalar])

  if (!uid) return null

  const yosh = sozlamalar ? backupAgeText(sozlamalar.last_backup) : null

  async function saveShop(e: FormEvent) {
    e.preventDefault()
    if (shopBusy) return
    setShopBusy(true)
    setShopError('')
    setShopOk('')
    try {
      if (!shop.shop_name.trim()) throw new Error("Do'kon nomini kiriting")
      const foiz = Number(lowStock)
      if (!Number.isFinite(foiz) || foiz < 0 || foiz > 100) {
        throw new Error('Foiz 0 dan 100 gacha bo\'lsin')
      }
      await setSettings({
        shop_name: shop.shop_name.trim(),
        address: shop.address.trim(),
        phone: shop.phone.trim(),
        low_stock_percent: String(foiz),
      })
      await logAudit(uid!, 'update', 'settings', 'Do\'kon sozlamalari saqlandi')
      setShopOk('Saqlandi')
    } catch (err) {
      setShopError(err instanceof Error ? err.message : 'Xatolik')
    } finally {
      setShopBusy(false)
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    if (passBusy) return
    setPassError('')
    setPassOk('')
    if (next !== repeat) {
      setPassError('Yangi parollar bir-biriga mos kelmadi')
      return
    }
    setPassBusy(true)
    try {
      await changePassword(uid!, current, next, uid!)
      setPassOk('Parol yangilandi')
      setCurrent('')
      setNext('')
      setRepeat('')
    } catch (err) {
      setPassError(err instanceof Error ? err.message : 'Xatolik')
    } finally {
      setPassBusy(false)
    }
  }

  async function saqlashZaxira() {
    if (backupBusy) return
    setBackupBusy(true)
    setBackupError('')
    setBackupMsg('')
    try {
      const file = await exportBackup()
      const sana = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      download(`dokon-zaxira-${sana}.json`, JSON.stringify(file, null, 2), 'application/json')
      await markBackupDone(uid!)
      setBackupMsg('Fayl yuklab olindi. Uni xavfsiz joyda (masalan bulut disk) saqlang.')
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Xatolik')
    } finally {
      setBackupBusy(false)
    }
  }

  async function yuklashZaxira(file: File) {
    if (backupBusy) return
    setBackupBusy(true)
    setBackupError('')
    setBackupMsg('')
    try {
      const text = await file.text()
      const natija = await importBackup(JSON.parse(text), uid!)
      if (!natija.ok) {
        setBackupError(natija.error ?? 'Xatolik')
        return
      }
      await markBackupDone(uid!)
      const yozuvlar = Object.values(natija.counts ?? {}).reduce((a, b) => a + b, 0)
      setBackupMsg(`Yuklandi: ${yozuvlar} ta yozuv. Endi "Joriy foydalanuvchi" yangilanishi uchun sahifani yangilang.`)
    } catch (err) {
      setBackupError(`Faylni o'qib bo'lmadi: ${err instanceof Error ? err.message : 'xatolik'}`)
    } finally {
      setBackupBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Sozlamalar</h1>

      <div className="space-y-4">
        {/* ── Do'kon ma'lumotlari ── */}
        <form onSubmit={saveShop} className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase text-slate-500">Do'kon ma'lumotlari</h2>
          {shopError && (
            <div className="mb-3">
              <ErrorBox message={shopError} />
            </div>
          )}
          {shopOk && (
            <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              {shopOk}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Do'kon nomi</label>
              <input
                className="fld"
                value={shop.shop_name}
                onChange={(e) => setShop({ ...shop, shop_name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Telefon</label>
              <input
                className="fld"
                value={shop.phone}
                onChange={(e) => setShop({ ...shop, phone: e.target.value })}
                placeholder="+998 90 000 00 00"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-600">Manzil</label>
              <input
                className="fld"
                value={shop.address}
                onChange={(e) => setShop({ ...shop, address: e.target.value })}
                placeholder="Ko'cha, uy, tuman"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">
                Kam qoldiq chegarasi (%)
              </label>
              <input
                className="fld"
                type="number"
                min={0}
                max={100}
                value={lowStock}
                onChange={(e) => setLowStock(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                Minimal miqdordan {lowStockPercent(lowStock)}% kam bo'lsa, ogohlantirish chiqadi.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Valyuta</label>
              <input className="fld" value="so'm (UZS)" disabled />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="btn-primary" disabled={shopBusy || !sozlamalar}>
              {shopBusy ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
          </div>
        </form>

        {/* ── Parol ── */}
        <form onSubmit={savePassword} className="card p-5">
          <h2 className="mb-1 text-sm font-bold uppercase text-slate-500">Parolni o'zgartirish</h2>
          <p className="mb-4 text-xs text-slate-400">
            Sizning hisobingiz: <b className="text-slate-600">{me?.fullName}</b> ({me?.login})
          </p>
          {passError && (
            <div className="mb-3">
              <ErrorBox message={passError} />
            </div>
          )}
          {passOk && (
            <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              {passOk}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Eski parol</label>
              <input
                className="fld"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Yangi parol</label>
              <input
                className="fld"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={4}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Yana bir marta</label>
              <input
                className="fld"
                type="password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                required
                minLength={4}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="btn-primary" disabled={passBusy}>
              {passBusy ? 'Yangilanmoqda…' : 'Parolni yangilash'}
            </button>
          </div>
        </form>

        {/* ── Zaxira nusxa ── */}
        <div className="card p-5">
          <h2 className="mb-1 text-sm font-bold uppercase text-slate-500">Zaxira nusxa</h2>
          <p className="mb-4 text-xs text-slate-400">
            Baza faqat shu kompyuterda saqlanadi. Kamida haftada bir marta fayl nusxasi oling.
          </p>

          {yosh && (
            <div
              className={`mb-4 rounded-lg px-3 py-2 text-sm font-medium ${
                yosh.ogohlantirish ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'
              }`}
            >
              Oxirgi zaxira: {yosh.matn}
              {sozlamalar?.last_backup && ` (${fmtDateTime(Number(sozlamalar.last_backup))})`}
            </div>
          )}

          {backupError && (
            <div className="mb-3">
              <ErrorBox message={backupError} />
            </div>
          )}
          {backupMsg && (
            <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              {backupMsg}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={saqlashZaxira} disabled={backupBusy}>
              {backupBusy ? 'Tayyorlanmoqda…' : 'Zaxira faylni yuklab olish'}
            </button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={backupBusy}>
              Zaxirani tiklash (import)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) yuklashZaxira(f)
              }}
            />
          </div>

          <p className="mt-3 text-xs text-amber-700">
            Diqqat: import qilinsa, hozirgi baza to'liq almashtiriladi. Avval zaxira fayl olib qo'ying.
          </p>
        </div>

        {/* ── Baza holati ── */}
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase text-slate-500">Baza holati</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {statistika
              .filter((t) => t.count > 0)
              .map((t) => (
                <div key={t.name} className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-400">{TABLE_LABEL[t.name] ?? t.name}</div>
                  <div className="text-sm font-bold text-slate-700">{t.count}</div>
                </div>
              ))}
          </div>

          {audit.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-bold text-slate-700">Oxirgi harakatlar</h3>
              <ul className="space-y-1 text-xs text-slate-500">
                {audit.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 border-b border-slate-50 py-1">
                    <span className="truncate">{a.summary}</span>
                    <span className="shrink-0 text-slate-400">{fmtDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const TABLE_LABEL: Record<string, string> = {
  products: 'Mahsulotlar',
  categories: 'Kategoriyalar',
  barcodes: 'Shtrix-kodlar',
  product_links: 'Blok↔dona',
  suppliers: 'Yetkazib beruvchilar',
  batches: 'Partiyalar',
  stock_movements: 'Ombor harakatlari',
  purchases: 'Kirimlar',
  purchase_items: 'Kirim tarkibi',
  inventories: 'Inventarizatsiyalar',
  inventory_items: 'Inventarizatsiya tarkibi',
  writeoffs: 'Yozuvlar',
  writeoff_items: 'Yozuv tarkibi',
  shifts: 'Smenalar',
  sales: 'Cheklar',
  sale_items: 'Chek tarkibi',
  sale_payments: 'To\'lovlar',
  cash_events: 'Naqd harakatlari',
  expense_categories: 'Chiqim turlari',
  expenses: 'Chiqimlar',
  users: 'Foydalanuvchilar',
  audit_log: 'Jurnal',
  settings: 'Sozlamalar',
  counters: 'Hisoblagichlar',
}