import type { ProductRow } from '../../db/repo/productsRepo'

interface Props {
  value: number
  onChange: (id: number) => void
  products: ProductRow[]
  allowEmpty?: boolean
  emptyLabel?: string
}

/**
 * Mahsulot tanlash (select).
 * Label ko'rinishi: "Nomi — kod" (kassir/menejer uchun qulay qidiruv)
 */
export default function ProductSelect({
  value,
  onChange,
  products,
  allowEmpty = false,
  emptyLabel = '— tanlang —',
}: Props) {
  return (
    <select className="fld" value={value || ''} onChange={(e) => onChange(Number(e.target.value))}>
      {allowEmpty && (
        <option value="">{emptyLabel}</option>
      )}
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nom} — {p.barcode}
        </option>
      ))}
    </select>
  )
}
