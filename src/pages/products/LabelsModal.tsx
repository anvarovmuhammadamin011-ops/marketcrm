import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { fmtMoney } from '../../db/repo/helpers'
import type { ProductRow } from '../../db/repo/productsRepo'
import type { LabelType } from '../../types'

interface Props {
  open: boolean
  product: ProductRow | null
  onClose: () => void
}

/**
 * ETIKETKA CHOP ETISH
 * Mahsulot kodini (EAN-13 / Code 128 / QR) chizadi va
 * `window.print()` orqali printerda chop etadi. Butunlay oflayn.
 */
export default function LabelsModal({ open, product, onClose }: Props) {
  const [count, setCount] = useState(10)
  const [format, setFormat] = useState<LabelType>('ean13')

  // Mahsulot ochilganda o'ning formatini olish
  useEffect(() => {
    if (product) setFormat(product.labelType)
  }, [product])

  if (!open || !product) return null

  const nom = product.nom
  const code = product.barcode
  const narx = fmtMoney(product.salePrice)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={onClose}
    >
      <div
        className="card my-6 w-full max-w-2xl p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-800">Etiketka chop etish</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* ── Sozlamalar ── */}
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Soni</label>
            <input
              className="fld w-24"
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Format</label>
            <select
              className="fld w-56"
              value={format}
              onChange={(e) => setFormat(e.target.value as LabelType)}
            >
              <option value="ean13">EAN-13 (zavod kodi)</option>
              <option value="code128">Code 128 (ichki kod)</option>
              <option value="qr">QR kod</option>
            </select>
          </div>

          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">
              Yopish
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-primary"
              title="Printerda chop etish"
            >
              Chop etish
            </button>
          </div>
        </div>

        {/* ── Namuna (ko'rinish) ── */}
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Namuna</div>
          <Label nom={nom} narx={narx} code={code} format={format} />
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Chop etish oynasida sahifa hajmi "A4 gorizontal" yoki 50×30 mm etiketka bo'lgani ma'qul.
        </p>

        {/* ── Chop etiladigan qism (faqat print rejimida ko'rinadi) ── */}
        <div className="print-area">
          <div className="labels-grid">
            {Array.from({ length: count }).map((_, i) => (
              <Label key={i} nom={nom} narx={narx} code={code} format={format} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Bitta etiketka */
function Label({
  nom,
  narx,
  code,
  format,
}: {
  nom: string
  narx: string
  code: string
  format: LabelType
}) {
  return (
    <div className="label-box">
      <div className="label-name">{nom}</div>
      <div className="label-price">{narx}</div>
      {format === 'qr' ? (
        <QrImage code={code} />
      ) : (
        <BarcodeSvg code={code} format={format} />
      )}
    </div>
  )
}

/** EAN-13 / Code 128 chizmasi (JsBarcode) */
function BarcodeSvg({ code, format }: { code: string; format: 'ean13' | 'code128' }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!svgRef.current) return
    try {
      JsBarcode(svgRef.current, code, {
        format: format === 'ean13' ? 'EAN13' : 'CODE128',
        displayValue: true,
        fontSize: 13,
        height: 38,
        width: 1.8,
        margin: 2,
      })
      setError('')
    } catch {
      setError(
        format === 'ean13'
          ? 'Bu kod to\'g\'ri EAN-13 emas — Code 128 ni tanlang'
          : 'Kodni chizib bo\'lmadi',
      )
    }
  }, [code, format])

  if (error) {
    return <div className="label-error">{error}</div>
  }
  return <svg ref={svgRef} className="label-barcode" />
}

/** QR kod rasm (qrcode kutubxonasi, offline) */
function QrImage({ code }: { code: string }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(code, { width: 140, margin: 1 })
      .then((data) => {
        if (alive) setUrl(data)
      })
      .catch(() => {
        if (alive) setUrl('')
      })
    return () => {
      alive = false
    }
  }, [code])

  if (!url) return <div className="label-error">QR kod yaratib bo'lmadi</div>
  return <img src={url} alt={code} className="label-qr" />
}
