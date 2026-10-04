/** Menyuda hali tayyor bo'lmagan bo'lim uchun vaqtinchalik ko'rinish */
export interface PlaceholderProps {
  title: string
  bosqich: number
  description: string
  /** Bu bo'limda nima bo'ladi — ro'yxat */
  items: string[]
}

export default function PlaceholderPage({ title, bosqich, description, items }: PlaceholderProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
          Bosqich {bosqich}
        </span>
      </div>

      <div className="card p-6">
        <p className="mb-4 text-slate-600">{description}</p>

        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          Bu yerda bo'ladi
        </h2>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          Bu bo'lim hozircha yopiq. Ma'lumotlar bazasi (Bosqich 1) tayyor —
          keyingi bosqichda shu bo'limning o'zi quriladi.
        </div>
      </div>
    </div>
  )
}
