import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import { db } from '../../db/database'
import {
  createProduct,
  ean13CheckDigit,
  generateInternalCode,
  isValidEan13,
  updateProduct,
  type ProductRow,
} from '../../db/repo/productsRepo'
import type { LabelType, Unit } from '../../types'
import { ErrorBox } from '../../components/ui/Modal'

interface Props {
  open: boolean
  product: ProductRow | null // null = yangi mahsulot
  userId: number
  onClose: () => void
}

const UNITS: Unit[] = ['dona', 'kg', 'litr', 'blok', 'quti']
const LABELS: Array<{ value: LabelType; nom: string }> = [
  { value: 'ean13', nom: 'EAN-13 (zavod kodi)' },
  { value: 'code128', nom: 'Code 128 (ichki kod)' },
  { value: 'qr', nom: 'QR kod' },
]

/** Mahsulot qo'shish / tahrirlash shakli */
export default function ProductFormModal({ open, product, userId, onClose }: Props) {
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), [], [])

  const [nom, setNom] = useState('')
  const [categoryId, setCategoryId] = useState(0)
  const [unit, setUnit] = useState<Unit>('dona')
  const [costPrice, setCostPrice] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [minQty, setMinQty] = useState('0')
  const [trackBatch, setTrackBatch] = useState(false)
  const [labelType, setLabelType] = useState<LabelType>('ean13')
  const [barcode, setBarcode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Oyna ochilganda maydonlarni to'ldirish
  useEffect(() => {
    if (!open) return
    setError('')
    if (product) {
      setNom(product.nom)
      setCategoryId(product.categoryId)
      setUnit(product.unit)
      setCostPrice(String(product.costPrice))
      setSalePrice(String(product.salePrice))
      setMinQty(String(product.minQty))
      setTrackBatch(product.trackBatch)
      setLabelType(product.labelType)
      setBarcode(product.barcode)
    } else {
      setNom('')
      setCategoryId(categories[0]?.id ?? 0)
      setUnit('dona')
      setCostPrice('')
      setSalePrice('')
      setMinQty('0')
      setTrackBatch(false)
      setLabelType('ean13')
      setBarcode('')
    }
  }, [open, product, categories])

  if (!open) return null

  /** Zavod kodi bo'lmagan mahsulot uchun ichki kod yaratish */
  async function generateCode() {
    try {
      const code = await generateInternalCode()
      setBarcode(code)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kod yaratib bo\'lmadi')
    }
  }

  /** 12 ta raqam kiritilsa — EAN-13 nazorat raqamini avtomatik qo'shish */
  function handleCodeBlur() {
    const v = barcode.trim()
    if (/^\d{12}$/.test(v)) {
      setBarcode(v + ean13CheckDigit(v))
    }
  }

  /** Yangi kategoriya qo'shish (shakldan chiqmasdan) */
  async function addCategory() {
    const nomi = window.prompt('Yangi kategoriya nomi:')
    if (!nomi?.trim()) return
    try {
      const id = await db.categories.add({ nom: nomi.trim(), parentId: null, sortOrder: categories.length })
      setCategoryId(id as number)
    } catch {
      setError('Bunday kategoriya allaqachon mavjud')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const input = {
        nom,
        categoryId,
        unit,
        costPrice: Number(costPrice) || 0,
        salePrice: Number(salePrice) || 0,
        minQty: Number(minQty) || 0,
        trackBatch,
        labelType,
        barcode,
      }

      if (product) await updateProduct(product.id!, input, userId)
      else await createProduct(input, userId)

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saqlashda xatolik yuz berdi')
    } finally {
      setBusy(false)
    }
  }

  const codeHint =
    barcode.trim() === ''
      ? 'Bo\'sh qoldirilsa — ICH-00000X ichki kod avtomatik yaratiladi'
      : isValidEan13(barcode.trim())
        ? "✓ To'g'ri EAN-13 kodi"
        : /^\d+$/.test(barcode.trim())
          ? 'EAN-13 emas (nazorat raqami mos emas) — etiketka Code 128 sifatida chiziladi'
          : 'Ichki / moslashgan kod'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        className="card my-6 w-full max-w-2xl p-6 shadow-xl"
      >
        <h2 className="mb-4 border-b border-slate-100 pb-3 text-lg font-bold text-slate-800">
          {product ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Nomi */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-600">Nomi *</label>
            <input
              className="fld"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Masalan: Coca-Cola 1.5L"
              autoFocus
              required
            />
          </div>

          {/* Kategoriya */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Kategoriya *</label>
            <div className="flex gap-2">
              <select
                className="fld"
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addCategory} title="Yangi kategoriya" className="btn-ghost px-3">
                +
              </button>
            </div>
          </div>

          {/* O'lchov birligi */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">O'lchov birligi</label>
            <select className="fld" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Narxlar */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Kirim narxi (tannarx, so'm)
            </label>
            <input
              className="fld"
              type="number"
              min={0}
              step={1}
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="0"
            />
            <p className="mt-1 text-xs text-slate-400">
              Kirim qilinganda avtomatik (og'irliklangan o'rtacha) yangilanadi
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Sotuv narxi (so'm) *
            </label>
            <input
              className="fld"
              type="number"
              min={0}
              step={1}
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="0"
              required
            />
          </div>

          {/* Minimal qoldiq */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Minimal qoldiq (ogohlantirish)
            </label>
            <input
              className="fld"
              type="number"
              min={0}
              step="any"
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
            />
          </div>

          {/* Etiketka formati */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Etiketka formati</label>
            <select
              className="fld"
              value={labelType}
              onChange={(e) => setLabelType(e.target.value as LabelType)}
            >
              {LABELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.nom}
                </option>
              ))}
            </select>
          </div>

          {/* Shtrix-kod */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Shtrix-kod (EAN-13 yoki ichki kod)
            </label>
            <div className="flex gap-2">
              <input
                className="fld font-mono"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onBlur={handleCodeBlur}
                placeholder="4780000000011 yoki ICH-000008"
              />
              <button type="button" onClick={generateCode} className="btn-ghost whitespace-nowrap">
                Ichki kod yaratish
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">{codeHint}</p>
          </div>

          {/* Partiya kuzatuvi */}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={trackBatch}
              onChange={(e) => setTrackBatch(e.target.checked)}
              className="h-4 w-4 accent-teal-600"
            />
            Partiya va yaroqlilik muddatini kuzatish (sut, go'sht, konserva uchun)
          </label>
        </div>

        <ErrorBox message={error} />

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="btn-ghost">
            Bekor qilish
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saqlanmoqda…' : product ? 'Saqlash' : "Qo'shish"}
          </button>
        </div>
      </form>
    </div>
  )
}
