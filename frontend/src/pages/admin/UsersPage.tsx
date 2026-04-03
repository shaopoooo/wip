import { useState, useEffect, useCallback } from 'react'
import { usersApi, rolesApi, AdminUserRow, Role } from '../../api/admin'

export function UsersPage() {
  const [items, setItems] = useState<AdminUserRow[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<AdminUserRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [users, roleList] = await Promise.all([usersApi.list(), rolesApi.list()])
      setItems(users)
      setRoles(roleList)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggleActive = async (user: AdminUserRow) => {
    await usersApi.update(user.id, { isActive: !user.isActive })
    load()
  }

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`確定刪除帳號「${username}」？`)) return
    try { await usersApi.delete(id); load() }
    catch (err) { alert((err as Error).message) }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">管理員帳號</h1>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className={BTN_PRIMARY}>+ 新增帳號</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">帳號</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">角色</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-slate-400">尚無帳號</td></tr>}
            {items.map(item => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{item.username}</td>
                <td className="px-4 py-3 text-slate-600">{item.roleName ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {item.isActive ? '啟用' : '停用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => { setEditing(item); setShowModal(true) }} className="text-blue-600 hover:text-blue-800 text-xs font-medium cursor-pointer">編輯</button>
                  <button onClick={() => handleToggleActive(item)} className="text-amber-600 hover:text-amber-800 text-xs font-medium cursor-pointer">
                    {item.isActive ? '停用' : '啟用'}
                  </button>
                  <button onClick={() => handleDelete(item.id, item.username)} className="text-red-500 hover:text-red-700 text-xs font-medium cursor-pointer">刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <UserModal
          roles={roles}
          user={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function UserModal({ roles, user, onClose, onSaved }: {
  roles: Role[]; user: AdminUserRow | null; onClose: () => void; onSaved: () => void
}) {
  const [username, setUsername] = useState(user?.username ?? '')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState(user?.roleId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!user && (!username.trim() || !password)) { setError('請填寫帳號與密碼'); return }
    setSaving(true); setError(null)
    try {
      if (user) {
        await usersApi.update(user.id, { roleId: roleId || null, ...(password ? { password } : {}) })
      } else {
        await usersApi.create({ username, password, roleId: roleId || null })
      }
      onSaved()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg">{user ? '編輯帳號' : '新增帳號'}</h2>
        <div className="space-y-3">
          {!user && <Field label="帳號"><input value={username} onChange={e => setUsername(e.target.value)} className={INPUT_CLS} /></Field>}
          <Field label={user ? '新密碼（留空不修改）' : '密碼'}>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={INPUT_CLS} placeholder="••••••" />
          </Field>
          <Field label="角色">
            <select value={roleId} onChange={e => setRoleId(e.target.value)} className={SELECT_CLS}>
              <option value="">（不指定）</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">取消</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 block mb-1">{label}</span>
      {children}
    </label>
  )
}

const SELECT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const INPUT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer'
