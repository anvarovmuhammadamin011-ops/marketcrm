import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Keng oyna (jadvalli sahifalar uchun) */
  wide?: boolean
}

/** Umumiy modul oyna — barcha shakllar shu yerdan foydalanadi */
export default function Modal({ open, title, onClose, children, wide }: ModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`card my-6 w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} p-6 shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Yopish"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Xato xabarini ko'rsatish (forma ichida) */
export function ErrorBox({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
      {message}
    </div>
  )
}
