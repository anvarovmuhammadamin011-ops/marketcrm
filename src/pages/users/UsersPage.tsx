import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import Modal, { ErrorBox } from '../../components/ui/Modal'
import { listAuditLog, type AuditRow } from '../../db/repo/auditRepo'
import { downloadCsv } from '../../db/repo/export'
import { fmtDateTime, fmtSum } from '../../db/repo/helpers'
import {
  changePassword,
  createUser,
  listUsers,
  setPassword,
  setUserActive,
  updateUser,
  type UserRow,
} from '../../db/repo/usersRepo'
import { useCurrentUser } from '../../hooks/useAuth'
import type { Role } from '../../types'

type Tab = 'users' | 'audit'

const ROLE_LABEL: Record<Role, string> = { owner: 'Egasi', cashier: 'Kassir' }

/** FOYDALANUVCHILAR — kassirlar, rollar, parol va audit jurnali */
export default function UsersPage() {
  const me = useCurrentUser()
  const [tab, setTab] = useState<Tab>('users')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // ── Yangi/qo'shish modali ──
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)

  // ── Parol modali ──
  const [parolUser, setParolUser] = useState<UserRow | null>(null)

  const users = useLiveQuery(() => listUsers(), [], [] as UserRow[])
  const audit = useLiveQuery<AuditRow[], never[]>(
    () => (tab === 'audit' ? listAuditLog(300) : Promise.resolve([])),
    [tab],
    [],
  )

  if (!me) return null
  const uid = me.id!

  async function handleSave(data: {
    login: string
    password: string
    fullName: string
    role: Role
  }) {
    setBusy(true)
    setError('')
    try {
      if (editing) {
        await updateUser(editing.id!, { fullName: data.fullName, role: data.role, isActive: editing.isActive }, uid)
      } else {
        await createUser(data, uid)
      }
      setShowForm(false)
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleActive(u: UserRow) {
    setError('')
    try {
      await setUserActive(u.id!, !u.isActive, uid)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik')
    }
  }

  function exportAudit() {
    if (audit.length === 0) return
    downloadCsv(
      `audit-jurnali-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Vaqt', 'Foydalanuvchi', 'Amal', 'Ob\'yekt', 'Izoh'],
      audit.map((a) => [
        fmtDateTime(a.createdAt),
        a.userNom,
        a.action,
        a.entityType,
        a.summary,
      ]),
    )
  }

  const faolEgasi = users.filter((u) => u.role === 'owner' && u.isActive).length

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold text-slate-800">Foydalanuvchilar va ruxsatlar</h1>
        {tab === 'audit' && (
          <button className="btn-ghost" onClick={exportAudit}>
            Jurnalni Excel'ga chiqarish
          </button>
        )}
        {tab === 'users' && (
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null)
              setError('')
              setShowForm(true)
            }}
          >
            + Kassir qo'shish
          </button>
        )}
      </div>

      {/* Tablar */}
      <div className="mb-4 flex gap-1">
        {(
          [
            ['users', 'Foydalanuvchilar'],
            ['audit', 'Audit jurnali'],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === key ? 'bg-teal-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      {tab === 'users' ? (
        <>
          {faolEgasi <= 1 && (
            <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Diqqat: faol egasi bittagina qoldi. Yangi egasi qo'shishni tavsiya qilamiz.
            </div>
          )}

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-3">F.I.O / Login</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3 text-center">Cheklar</th>
                  <th className="px-4 py-3 text-right">Tushum</th>
                  <th className="px-4 py-3">Oxirgi harakat</th>
                  <th className="px-4 py-3">Holat</th>
                  <th className="px-4 py-3 text-right">Amal</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      Foydalanuvchi yo'q
                    </td>
                  </tr>
                )}
                {users.map((u) => (
                  <tr key={u.id} className={`border-t border-slate-100 ${u.isActive ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-700">
                        {u.fullName}
                        {u.id === uid && <span className="ml-2 text-xs text-teal-600">(siz)</span>}
                      </div>
                      <div className="text-xs text-slate-400">{u.login}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          u.role === 'owner'
                            ? 'bg-teal-50 text-teal-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{u.salesCount}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{fmtSum(u.salesTotal)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {u.lastActionAt ? fmtDateTime(u.lastActionAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          u.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {u.isActive ? 'faol' : 'bloklangan'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          onClick={() => {
                            setEditing(u)
                            setError('')
                            setShowForm(true)
                          }}
                        >
                          Tahrirlash
                        </button>
                        <button
                          className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          onClick={() => {
                            setError('')
                            setParolUser(u)
                          }}
                        >
                          Parol
                        </button>
                        {u.id !== uid && (
                          <button
                            className={`rounded px-2 py-1 text-xs font-semibold ${
                              u.isActive
                                ? 'text-rose-600 hover:bg-rose-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            onClick={() => handleToggleActive(u)}
                          >
                            {u.isActive ? 'Bloklash' : 'Ochish'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            <b className="text-slate-600">Egasi</b> — barcha bo'limlarga kiradi.{' '}
            <b className="text-slate-600">Kassir</b> — faqat kassa (sotuv) bo'limi.
          </p>
        </>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">Vaqt</th>
                <th className="px-4 py-3">Kim</th>
                <th className="px-4 py-3">Amal</th>
                <th className="px-4 py-3">Izoh</th>
              </tr>
            </thead>
            <tbody>
              {audit.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    Jurnal bo'sh
                  </td>
                </tr>
              )}
              {audit.map((a) => (
                <tr key={a.id} className="border-t border-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-400">
                    {fmtDateTime(a.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{a.userNom}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        ACTION_RANG[a.action] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {a.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-700">{a.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserFormModal
        open={showForm}
        user={editing}
        busy={busy}
        error={error}
        onClose={() => setShowForm(false)}
        onSave={handleSave}
      />

      <PasswordModal
        user={parolUser}
        isSelf={parolUser?.id === uid}
        onClose={() => setParolUser(null)}
      />
    </div>
  )
}

const ACTION_RANG: Record<string, string> = {
  login: 'bg-teal-50 text-teal-700',
  logout: 'bg-slate-100 text-slate-600',
  create: 'bg-emerald-50 text-emerald-700',
  update: 'bg-sky-50 text-sky-700',
  delete: 'bg-rose-50 text-rose-700',
  void_sale: 'bg-rose-50 text-rose-700',
  disable: 'bg-rose-50 text-rose-700',
  enable: 'bg-emerald-50 text-emerald-700',
  backup: 'bg-indigo-50 text-indigo-700',
  import: 'bg-amber-50 text-amber-700',
}

// ─────────────────────────── FORM MODAL ───────────────────────────

function UserFormModal({
  open,
  user,
  busy,
  error,
  onClose,
  onSave,
}: {
  open: boolean
  user: UserRow | null
  busy: boolean
  error: string
  onClose: () => void
  onSave: (data: { login: string; password: string; fullName: string; role: Role }) => void
}) {
  const [fullName, setFullName] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('cashier')

  // Modal ochilganda maydonlarni to'ldirish
  useEffect(() => {
    if (!open) return
    setFullName(user?.fullName ?? '')
    setLogin(user?.login ?? '')
    setPassword('')
    setRole(user?.role ?? 'cashier')
  }, [open, user])

  if (!open) return null

  function submit(e: FormEvent) {
    e.preventDefault()
    onSave({ login, password, fullName, role })
  }

  return (
    <Modal open={open} title={user ? 'Foydalanuvchini tahrirlash' : 'Yangi kassir'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBox message={error} />}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">F.I.O</label>
          <input className="fld" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Login</label>
          <input
            className="fld"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            disabled={!!user}
            placeholder="masalan: kassir1"
            required
          />
          {user && <p className="mt-1 text-xs text-slate-400">Login ni o'zgartirib bo'lmaydi</p>}
        </div>
        {!user && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Parol</label>
            <input
              className="fld"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="kamida 4 ta belgi"
              required
              minLength={4}
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Rol</label>
          <select className="fld" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="cashier">Kassir — faqat sotuv</option>
            <option value="owner">Egasi — hamma huquq</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Bekor qilish
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─────────────────────────── PAROL MODAL ───────────────────────────

function PasswordModal({
  user,
  isSelf,
  onClose,
}: {
  user: UserRow | null
  isSelf: boolean
  onClose: () => void
}) {
  const me = useCurrentUser()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCurrent('')
    setNext('')
    setRepeat('')
    setError('')
    setOk('')
  }, [user?.id])

  if (!user || !me) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setOk('')
    if (next !== repeat) {
      setError('Yangi parollar bir-biriga mos kelmadi')
      return
    }
    setBusy(true)
    try {
      if (isSelf) await changePassword(user!.id!, current, next, me!.id!)
      else await setPassword(user!.id!, next, me!.id!)
      setOk('Parol yangilandi')
      setCurrent('')
      setNext('')
      setRepeat('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Parol: ${user.fullName}`}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBox message={error} />}
        {ok && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{ok}</div>
        )}

        {isSelf && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Eski parol</label>
            <input
              className="fld"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoFocus
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Yangi parol</label>
          <input
            className="fld"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={4}
            autoFocus={!isSelf}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Yangi parol (yana)</label>
          <input
            className="fld"
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
            minLength={4}
          />
        </div>

        {!isSelf && (
          <p className="text-xs text-slate-400">
            Foydalanuvchiga yangi parolni aytib bering — u kirishda shuni ishlatsin.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Yopish
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saqlanmoqda…' : 'Parolni yangilash'}
          </button>
        </div>
      </form>
    </Modal>
  )
}