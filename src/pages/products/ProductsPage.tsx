import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { db } from '../../db/database'
import { fmtMoney, fmtQty } from '../../db/repo/helpers'
import {
  listProducts,
  setProductActive,
  type ProductRow,
} from '../../db/repo/productsRepo'
import { useCurrentUser } from '../../hooks/useAuth'
import LabelsModal from './LabelsModal'
import LinksModal from './LinksModal'
import ProductFormModal from './ProductFormModal'

/**
 * MAHSULOTLAR BAZASI
 * — ro'yxat, qidiruv, kategoriya filtri, qoldiq kuzatuvi,
 * qo'shish/tahrirlash, shtrix-kod va etiketka chop etish.
 */
export default function ProductsPage() {
  const user = useCurrentUser()

  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState(0)
  const [lowOnly, setLowOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [labelFor, setLabelFor] = useState<ProductRow | null>(null)
  const [linksOpen, setLinksOpen] = useState(false)

  // Jonli so'rov: mahsulot/kategoriya/o'zgarish bo'lsa ekran yangilanadi
  const products = useLiveQuery(
    () =>
      listProducts({
        q,
        categoryId: categoryId || undefined,
        activeOnly: !showArchived,
        lowOnly,
      }),
    [q, categoryId, lowOnly, showArchived],
    [] as ProductRow[],
  )

  const categories = useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    [],
    [],
  )

  const jamiQiymat = products.reduce((s, p) => s + p.stockValue, 0)
  const kamSoni = products.filter((p) => p.low).length

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(p: ProductRow) {
    setEditing(p)
    setFormOpen(true)
  }

  async function toggleActive(p: ProductRow) {
    try {
      await setProductActive(p.id!, !p.isActive, user!.id!)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik yuz berdi')
    }
  }

  return (
    <div>
      {/* ── Sarlavha va filtrlar ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold text-slate-800">Mahsulotlar</h1>

        <input
          className="fld w-64"
          placeholder="Nom yoki shtrix-kod bo'yicha qidirish…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          className="fld w-48"
          value={categoryId}
          onChange={(e) => setCategoryId(Number(e.target.value))}
        >
          <option value={0}>Barcha kategoriyalar</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
            className="h-4 w-4 accent-rose-600"
          />
          Faqat kam qoldiq
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 accent-slate-600"
          />
          Arxivni ko'rsatish
        </label>

        <button className="btn-ghost" onClick={() => setLinksOpen(true)}>
          Blok ↔ Dona
        </button>
        <button className="btn-primary" onClick={openNew}>
          + Yangi mahsulot
        </button>
      </div>

      {/* ── Qisqa statistika ── */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Mahsulotlar" value={String(products.length)} />
        <Stat label="Kam qoldiq" value={String(kamSoni)} danger={kamSoni > 0} />
        <Stat label="Ombordagi qiymat" value={fmtMoney(jamiQiymat)} suffix="so'm" />
        <Stat label="Arxivlangan" value={String(showArchived ? products.filter((p) => !p.isActive).length : 0)} />
      </div>

      {/* ── Jadval ── */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="px-4 py-3">Kod</th>
              <th className="px-4 py-3">Nomi</th>
              <th className="px-4 py-3">Kategoriya</th>
              <th className="px-4 py-3">O'lchov</th>
              <th className="px-4 py-3 text-right">Kirim narxi</th>
              <th className="px-4 py-3 text-right">Sotuv narxi</th>
              <th className="px-4 py-3 text-right">Qoldiq</th>
              <th className="px-4 py-3 text-right">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  {q ? 'Qidiruv bo\'yicha mahsulot topilmadi' : 'Hali mahsulot yo\'q — "Yangi mahsulot" tugmasini bosing'}
                </td>
              </tr>
            )}

            {products.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-slate-100 transition hover:bg-slate-50 ${
                  !p.isActive ? 'opacity-50' : ''
                }`}
              >
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{p.barcode}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800">{p.nom}</div>
                  {p.trackBatch && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      PARTIYA
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{p.categoryName}</td>
                <td className="px-4 py-2.5 text-slate-600">{p.unit}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{fmtMoney(p.costPrice)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                  {fmtMoney(p.salePrice)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span
                    className={`inline-block min-w-16 rounded px-2 py-0.5 font-semibold ${
                      p.low
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                    title={p.low ? `Minimal qoldiq: ${fmtQty(p.minQty)} ${p.unit}` : ''}
                  >
                    {fmtQty(p.stock)}
                    {p.low && ' !'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    <IconBtn title="Tahrirlash" onClick={() => openEdit(p)}>
                      ✎
                    </IconBtn>
                    <IconBtn title="Etiketka chop etish" onClick={() => setLabelFor(p)}>
                      ▤
                    </IconBtn>
                    <IconBtn
                      title={p.isActive ? 'Arxivlash' : 'Qayta faollashtirish'}
                      onClick={() => toggleActive(p)}
                      danger={p.isActive}
                    >
                      {p.isActive ? '⌫' : '⟲'}
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modallar ── */}
      <ProductFormModal
        open={formOpen}
        product={editing}
        userId={user!.id!}
        onClose={() => setFormOpen(false)}
      />

      <LabelsModal open={!!labelFor} product={labelFor} onClose={() => setLabelFor(null)} />

      <LinksModal open={linksOpen} userId={user!.id!} onClose={() => setLinksOpen(false)} />
    </div>
  )
}

/** Qisqa statistika kartochkasi */
function Stat({
  label,
  value,
  suffix,
  danger,
}: {
  label: string
  value: string
  suffix?: string
  danger?: boolean
}) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium uppercase text-slate-400">{label}</div>
      <div className={`text-lg font-bold ${danger ? 'text-rose-600' : 'text-slate-800'}`}>
        {value}
        {suffix && <span className="ml-1 text-xs font-normal text-slate-400">{suffix}</span>}
      </div>
    </div>
  )
}

/** Kichik amal tugmasi */
function IconBtn({
  title,
  onClick,
  children,
  danger,
}: {
  title: string
  onClick: () => void
  children: ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-7 w-7 rounded-md border text-sm transition ${
        danger
          ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
          : 'border-slate-200 text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}
