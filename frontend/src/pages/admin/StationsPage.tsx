import { useState, useEffect, useCallback } from 'react'
import { stationsApi, groupsApi, departmentsApi, Station, Group } from '../../api/admin'
import type { Department } from '../../api/admin'

export function StationsPage() {
  const [depts, setDepts] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState('')
  const [items, setItems] = useState<Station[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Station | null>(null)

  useEffect(() => {
    departmentsApi.list().then(d => {
      setDepts(d)
      if (d.length > 0) setSelectedDept(d[0]!.id)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!selectedDept) return
    setLoading(true)
    try {
      const [stationData, groupData] = await Promise.all([
        stationsApi.listByDept(selectedDept),
        groupsApi.listByDept(selectedDept),
      ])
      setItems(stationData.filter(s => s.isActive))
      setGroups(groupData.filter(g => g.isActive))
    } finally {
      setLoading(false)
    }
  }, [selectedDept])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('確定停用此站點？')) return
    await stationsApi.delete(id)
    load()
  }

  const groupName = (groupId: string | null) => groups.find(g => g.id === groupId)?.name ?? '—'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">站點管理</h1>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className={BTN_PRIMARY}>+ 新增站點</button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className={SELECT_CLS}>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">站點名稱</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">代碼</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">所屬組別</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">說明</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">尚無站點</td></tr>}
            {items.map(item => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                <td className="px-4 py-3 font-mono text-slate-600">{item.code ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{groupName(item.groupId)}</td>
                <td className="px-4 py-3 text-slate-500">{item.description ?? '—'}</td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => { setEditing(item); setShowModal(true) }} className="text-blue-600 hover:text-blue-800 text-xs font-medium cursor-pointer">編輯</button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 text-xs font-medium cursor-pointer">停用</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <StationModal
          groups={groups}
          defaultDeptId={selectedDept}
          station={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function StationModal({ groups, defaultDeptId, station, onClose, onSaved }: {
  groups: Group[]; defaultDeptId: string
  station: Station | null; onClose: () => void; onSaved: () => void
}) {
  const [deptId] = useState(station?.departmentId ?? defaultDeptId)
  const [groupId, setGroupId] = useState(station?.groupId ?? '')
  const [name, setName] = useState(station?.name ?? '')
  const [code, setCode] = useState(station?.code ?? '')
  const [description, setDescription] = useState(station?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { setError('請填寫站點名稱'); return }
    setSaving(true)
    setError(null)
    try {
      if (station) {
        await stationsApi.update(station.id, { groupId: groupId || null, name, code: code || null, description: description || null })
      } else {
        await stationsApi.create({ departmentId: deptId, groupId: groupId || null, name, code: code || null, description: description || null })
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg">{station ? '編輯站點' : '新增站點'}</h2>
        <div className="space-y-3">
          <Field label="站點名稱"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} /></Field>
          <Field label="代碼（選填）"><input value={code} onChange={e => setCode(e.target.value)} className={INPUT_CLS} placeholder="ST-01" /></Field>
          <Field label="所屬組別（選填）">
            <select value={groupId} onChange={e => setGroupId(e.target.value)} className={SELECT_CLS}>
              <option value="">（不指定）</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <Field label="說明（選填）"><input value={description} onChange={e => setDescription(e.target.value)} className={INPUT_CLS} /></Field>
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
