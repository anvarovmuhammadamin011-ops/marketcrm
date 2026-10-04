import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { fmtMoney, fmtQty, fmtDateTime } from '../../db/repo/helpers'
import {
  listProducts,
  resolveBarcode,
  type ProductRow,
} from '../../db/repo/productsRepo'
import { commitSale, type CartLine, type SaleResult } from '../../db/repo/salesRepo'
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner'
import { useCurrentUser } from '../../hooks/useAuth'
import type { Product } from '../../types'

interface CartItem {
  productId: number
  nom: string
  unit: string
  qty: number
  unitPrice: number
}

type PaymentMode = 'cash' | 'card' | 'mixed'

interface Props {
  shiftId: number
}

/**
 * KASSA (sotuv) ekrani
 * — skaner yoki qo'lda qidirish, savat, chegirma, to'lov va qaytim.
 */
export default function PosPage({ shiftId }: Props) {
  const user = useCurrentUser()
  const isOwner = user?.role === 'owner'

  const products = useLiveQuery(() => listProducts(), [], [] as ProductRow[])

  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')

  // Chegirma
  const [discountType, setDiscountType] = useState<'sum' | 'percent'>('sum')
  const [discountValue, setDiscountValue] = useState('')

  // To'lov
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [received, setReceived] = useState('') // naqd: mijoz bergan pul
  const [mixedCash, setMixedCash] = useState('') // aralash: naqd qismi

  // Yakunlangan savdo
  const [done, setDone] = useState<(SaleResult & { change: number }) | null>(null)
  const [busy, setBusy] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  // Qoldiq — mahsulotlar jadvalidan jonli o'qiladi (savatdagi nusxasi emas)
  const stockMap = useMemo(
    () => new Map(products.map((p) => [p.id, p.stock])),
    [products],
  )

  // ── Hisoblar ──
  const subtotal = cart.reduce((s, i) => s + i.qty * i.unitPrice, 0)
  const discountRaw =
    discountType === 'sum'
      ? Number(discountValue) || 0
      : Math.round((subtotal * (Number(discountValue) || 0)) / 100)
  const discount = Math.min(discountRaw, subtotal)
  const total = Math.max(subtotal - discount, 0)

  const cashPortion = mode === 'cash' ? total : mode === 'mixed' ? Math.min(Number(mixedCash) || 0, total) : 0
  const cardPortion = total - cashPortion
  const change = mode === 'cash' ? (Number(received) || 0) - total : 0

  const stockOverflow = cart.find(
    (i) => i.qty > (stockMap.get(i.productId) ?? 0) + 0.0001,
  )
  const canSubmit =
    cart.length > 0 &&
    !busy &&
    !stockOverflow &&
    (mode !== 'cash' || (Number(received) || 0) >= total) &&
    (mode !== 'mixed' || (Number(mixedCash) || 0) <= total)

  // ── Qidiruv natijalari ──
  const results = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return []
    return products
      .filter((p) => p.nom.toLowerCase().includes(t) || p.barcode.includes(t))
      .slice(0, 8)
  }, [search, products])

  // ── Savat amallari ──
  function addToCart(product: Product, qty = 1) {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.productId === product.id)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], qty: Number((copy[idx].qty + qty).toFixed(3)) }
        return copy
      }
      return [
        ...prev,
        {
          productId: product.id!,
          nom: product.nom,
          unit: product.unit,
          qty,
          unitPrice: product.salePrice,
        },
      ]
    })
    setError('')
    setFlash(`${product.nom} +${fmtQty(qty)}`)
  }

  function setQty(productId: number, qty: number) {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((i) => i.productId !== productId)
        : prev.map((i) => (i.productId === productId ? { ...i, qty } : i)),
    )
  }

  function removeItem(productId: number) {
    setCart((prev) => prev.filter((i) => i.productId !== productId))
  }

  function clearCart() {
    setCart([])
    setDiscountValue('')
    setError('')
  }

  // ── Kodni qabul qilish (skaner yoki Enter) ──
  async function applyCode(code: string): Promise<boolean> {
    const resolved = await resolveBarcode(code)
    if (!resolved) {
      setError(`Kod topilmadi: ${code}`)
      return false
    }
    addToCart(resolved.product, resolved.qty)
    return true
  }

  // Klaviatura skaneri (fokus istalgan joyda bo'lganda)
  useBarcodeScanner(
    (code) => {
      void applyCode(code)
    },
    { minLength: 3, enabled: !done, ignoreWhenTyping: true },
  )

  // Qidiruv maydonida Enter
  async function handleSearchEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const value = search.trim()
    if (!value) return

    const ok = await applyCode(value)
    if (!ok && results.length > 0) addToCart(results[0])
    if (ok || results.length > 0) {
      setSearch('')
      setSearchOpen(false)
    }
    searchRef.current?.focus()
  }

  // ── Savdo yakunlash ──
  async function handlePay() {
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      const lines: CartLine[] = cart.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        unitPrice: i.unitPrice,
      }))

      const payments =
        mode === 'cash'
          ? [{ method: 'cash' as const, amount: total, change }]
          : mode === 'card'
            ? [{ method: 'card' as const, amount: total }]
            : [
                { method: 'cash' as const, amount: cashPortion, change: 0 },
                { method: 'card' as const, amount: cardPortion },
              ]

      const result = await commitSale({
        lines,
        discount,
        payments,
        userId: user!.id!,
        shiftId,
      })

      setDone({ ...result, change: mode === 'cash' ? change : 0 })
      setCart([])
      setDiscountValue('')
      setReceived('')
      setMixedCash('')
      setSearch('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Savdo saqlanmadi')
    } finally {
      setBusy(false)
    }
  }

  // Flash xabarni 2 soniyadan keyin o'chirish
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 2000)
    return () => clearTimeout(t)
  }, [flash])

  // Qidiruvga fokus berish
  useEffect(() => {
    searchRef.current?.focus()
  }, [done])

  if (done) return <SaleDone result={done} onNew={() => setDone(null)} />

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-5">
      {/* ─────────────── SAVAT ─────────────── */}
      <div className="card flex min-h-0 flex-col lg:col-span-3">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-bold text-slate-800">
            Savat <span className="text-slate-400">({cart.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            {flash && (
              <span className="rounded bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">
                {flash}
              </span>
            )}
            {cart.length > 0 && (
              <button className="btn-ghost !py-1 text-xs" onClick={clearCart}>
                Savatni tozalash
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-slate-400">
              <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 7h18v10H3zM7 17v2M17 17v2M7 11h.01M12 11h.01M17 11h.01" strokeLinecap="round" />
              </svg>
              <p className="text-sm">
                Shtrix-kodni skanerlang yoki yuqoridagi qidiruvdan mahsulot tanlang
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Mahsulot</th>
                  <th className="w-36 px-4 py-2 text-center">Soni</th>
                  <th className="w-32 px-4 py-2 text-right">Narx</th>
                  <th className="w-32 px-4 py-2 text-right">Jami</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {cart.map((i) => {
                  const available = stockMap.get(i.productId) ?? 0
                  const over = i.qty > available + 0.0001
                  return (
                    <tr key={i.productId} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        <div className="font-medium text-slate-800">{i.nom}</div>
                        {over && (
                          <div className="text-xs font-semibold text-rose-600">
                            Qoldiq yetarli emas (bor: {fmtQty(available)})
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            className="h-7 w-7 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                            onClick={() => setQty(i.productId, Number((i.qty - 1).toFixed(3)))}
                          >
                            −
                          </button>
                          <input
                            className="fld w-16 px-1 text-center"
                            type="number"
                            step="any"
                            min="0"
                            value={i.qty}
                            onChange={(e) => setQty(i.productId, Number(e.target.value))}
                          />
                          <button
                            className="h-7 w-7 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                            onClick={() => setQty(i.productId, Number((i.qty + 1).toFixed(3)))}
                          >
                            +
                          </button>
                          <span className="w-8 text-xs text-slate-400">{i.unit}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">{fmtMoney(i.unitPrice)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-800">
                        {fmtMoney(i.qty * i.unitPrice)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          className="rounded px-1.5 py-1 text-rose-500 hover:bg-rose-50"
                          onClick={() => removeItem(i.productId)}
                          title="O'chirish"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Chegirma ── */}
        {cart.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3">
            <span className="text-sm font-medium text-slate-500">Chegirma:</span>
            <select
              className="fld w-32"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'sum' | 'percent')}
              disabled={!isOwner}
              title={isOwner ? '' : 'Chegirmani faqat egasi beradi'}
            >
              <option value="sum">so'm</option>
              <option value="percent">%</option>
            </select>
            <input
              className="fld w-28 text-right"
              type="number"
              min="0"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder="0"
              disabled={!isOwner}
            />
            {discount > 0 && (
              <span className="text-sm font-semibold text-rose-600">− {fmtMoney(discount)}</span>
            )}
            {!isOwner && (
              <span className="text-xs text-slate-400">Chegirma: faqat egasi</span>
            )}
          </div>
        )}
      </div>

      {/* ─────────────── QIDIRUV + TO'LOV ─────────────── */}
      <div className="flex flex-col gap-4 lg:col-span-2">
        {/* Qidiruv */}
        <div className="card relative p-4">
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">
            Shtrix-kod yoki nom
          </label>
          <input
            ref={searchRef}
            className="fld text-base"
            placeholder="Skanerlang yoki yozing…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={handleSearchEnter}
          />

          {searchOpen && search.trim() && (
            <div className="absolute left-4 right-4 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-400">Topilmadi</div>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-teal-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      addToCart(p)
                      setSearch('')
                      searchRef.current?.focus()
                    }}
                  >
                    <span className="truncate font-medium text-slate-700">{p.nom}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {fmtMoney(p.salePrice)} · {fmtQty(p.stock)} {p.unit}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Jami summa */}
        <div className="card p-4">
          <div className="flex justify-between text-sm text-slate-500">
            <span>Oraliq jami</span>
            <span>{fmtMoney(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="mt-1 flex justify-between text-sm text-rose-600">
              <span>Chek chegirmasi</span>
              <span>− {fmtMoney(discount)}</span>
            </div>
          )}
          <div className="mt-2 flex items-end justify-between border-t border-slate-100 pt-2">
            <span className="font-semibold text-slate-600">To'lovga</span>
            <span className="text-3xl font-black text-teal-700">{fmtMoney(total)}</span>
          </div>
        </div>

        {/* To'lov turi */}
        <div className="card p-4">
          <div className="mb-3 grid grid-cols-3 gap-2">
            {(
              [
                ['cash', 'Naqd'],
                ['card', 'Karta'],
                ['mixed', 'Aralash'],
              ] as Array<[PaymentMode, string]>
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition ${
                  mode === m
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'cash' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-600">
                Mijoz bergan pul (so'm)
              </label>
              <input
                className="fld text-right text-lg font-bold"
                type="number"
                min="0"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder={String(total)}
              />
              <div className="grid grid-cols-3 gap-2">
                {[total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000].map(
                  (v, idx) => (
                    <button
                      key={idx}
                      className="btn-ghost !py-1 text-xs"
                      onClick={() => setReceived(String(v))}
                    >
                      {fmtMoney(v)}
                    </button>
                  ),
                )}
              </div>
              <div
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold ${
                  change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                <span>Qaytim:</span>
                <span>{fmtMoney(Math.max(change, 0))}</span>
              </div>
              {change < 0 && (
                <div className="text-xs font-semibold text-rose-600">
                  Pul yetarli emas — {fmtMoney(-change)} kam
                </div>
              )}
            </div>
          )}

          {mode === 'mixed' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-600">
                Naqd qismi (so'm) — qolgani kartadan
              </label>
              <input
                className="fld text-right text-lg font-bold"
                type="number"
                min="0"
                max={total}
                value={mixedCash}
                onChange={(e) => setMixedCash(e.target.value)}
                placeholder="0"
              />
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Naqd:</span>
                <b>{fmtMoney(cashPortion)}</b>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Karta:</span>
                <b>{fmtMoney(cardPortion)}</b>
              </div>
            </div>
          )}

          {mode === 'card' && (
            <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">
              Karta orqali to'lov: {fmtMoney(total)}
            </div>
          )}
        </div>

        {/* Xato xabari */}
        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        {/* To'lov tugmasi */}
        <button
          onClick={handlePay}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-teal-700 py-4 text-lg font-black text-white transition hover:bg-teal-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Saqlanmoqda…' : `TO'LOVNI QABUL QILISH — ${fmtMoney(total)}`}
        </button>
      </div>
    </div>
  )
}

/** Savdo yakunlangach ko'rinadigan ekran */
function SaleDone({
  result,
  onNew,
}: {
  result: SaleResult & { change: number }
  onNew: () => void
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="card w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="text-xs uppercase tracking-wide text-slate-400">Chek raqami</div>
        <div className="text-2xl font-black text-slate-800">#{result.no}</div>

        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Sana</span>
            <b>{fmtDateTime(result.datetime)}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">To'lov</span>
            <b className="text-lg text-teal-700">{fmtMoney(result.total)}</b>
          </div>
          {result.change > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Qaytim</span>
              <b className="text-emerald-700">{fmtMoney(result.change)}</b>
            </div>
          )}
        </div>

        <button onClick={onNew} className="btn-primary mt-6 w-full py-3">
          Yangi savdo
        </button>
      </div>
    </div>
  )
}
