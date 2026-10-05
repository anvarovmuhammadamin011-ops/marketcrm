import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../../db/database'
import { printPurchaseReceipt, printSaleReceipt, shopFromSettings } from '../../db/repo/receipt'
import { getSaleItems } from '../../db/repo/salesRepo'
import { listPurchasePayments } from '../../db/repo/suppliersRepo'
import type { Purchase, Sale, SalePayment } from '../../types'

/** Do'kon ma'lumotlari (chek sarlavhasi uchun) */
function useShop() {
  return useLiveQuery(async () => shopFromSettings(await db.settings.toArray()), [], {})
}

function usePrint() {
  const [busy, setBusy] = useState(false)
  async function run(fn: () => Promise<void> | void) {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

type Variant = 'primary' | 'ghost'

/** Sotuv chekini chop etish */
export function SalePrintButton({
  saleId,
  cashier,
  variant = 'primary',
  label = "Chekni chop etish",
}: {
  saleId: number
  cashier?: string
  variant?: Variant
  label?: string
}) {
  const shop = useShop()
  const { busy, run } = usePrint()

  return (
    <button
      type="button"
      className={variant === 'primary' ? 'btn-primary' : 'btn-ghost'}
      disabled={busy}
      onClick={() =>
        run(async () => {
          const sale = await db.sales.get(saleId)
          if (!sale) return
          const items = await getSaleItems(saleId)
          const payments = await db.sale_payments.where('saleId').equals(saleId).toArray()
          let kassir = cashier ?? '—'
          if (!cashier) {
            const u = await db.users.get(sale.userId)
            kassir = u?.fullName ?? '—'
          }
          printSaleReceipt({
            sale: sale as Sale,
            items,
            payments: payments as SalePayment[],
            cashier: kassir,
            shop,
          })
        })
      }
    >
      {busy ? 'Tayyorlanmoqda…' : label}
    </button>
  )
}

/** Yetkazib beruvchiga to'lanadigan kirim hujjatini chop etish */
export function PurchasePrintButton({
  purchaseId,
  variant = 'ghost',
  label = "Hujjatni chop etish",
}: {
  purchaseId: number
  variant?: Variant
  label?: string
}) {
  const shop = useShop()
  const { busy, run } = usePrint()

  return (
    <button
      type="button"
      className={variant === 'primary' ? 'btn-primary' : 'btn-ghost'}
      disabled={busy}
      onClick={() =>
        run(async () => {
          const purchase = await db.purchases.get(purchaseId)
          if (!purchase) return
          const [items, payments, supplier] = await Promise.all([
            db.purchase_items.where('purchaseId').equals(purchaseId).toArray(),
            listPurchasePayments(purchaseId),
            db.suppliers.get(purchase.supplierId),
          ])
          const products = await db.products
            .where('id')
            .anyOf([...new Set(items.map((i) => i.productId))])
            .toArray()
          const noms = new Map(products.map((p) => [p.id!, p.nom]))
          printPurchaseReceipt({
            purchase: purchase as Purchase,
            items: items.map((i) => ({ ...i, productNom: noms.get(i.productId) ?? '—' })),
            payments,
            supplierNom: supplier?.nom ?? '—',
            shop,
          })
        })
      }
    >
      {busy ? 'Tayyorlanmoqda…' : label}
    </button>
  )
}