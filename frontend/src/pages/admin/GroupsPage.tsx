import { useState, useEffect, useCallback } from 'react'
import { groupsApi, departmentsApi, Group, Department } from '../../api/admin'
import { useServerTable } from '../../hooks/useServerTable'
import { TableControls } from '../../components/TableControls'

export function GroupsPage() {
  const st = useServerTable<Group>({ defaultLimit: 25 })
  const [depts, setDepts] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState('')
  const [isActive, setIsActive] = useState('true')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [reordering, setReordering] = useState(false)
  const [originalOrder, setOriginalOrder] = useState<string[]>([])  // id list in original order

  useEffect(() => {
    departmentsApi.list().then(d => {
      setDepts(d)
      if (d.length > 0) setSelectedDept(d[0]!.id)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!selectedDept) return
    st.setLoading(true)
    try {
      const result = await groupsApi.list(selectedDept, {
        ...st.params,
        isActive: isActive || undefined,
      })
      st.setData(result.items, result.total)
      setOriginalOrder(result.items.map(g => g.id))
      setReordering(false)
    } catch { } finally { st.setLoading(false) }
  }, [st.params, selectedDept, isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const handleDeptChange = (val: string) => { setSelectedDept(val); st.setPage(1) }
  const handleIsActiveChange = (val: string) => { setIsActive(val); st.setPage(1) }

  const handleDelete = async (id: string) => {
    if (!confirm('確定停用此組別？')) return
    await groupsApi.delete(id)
    void load()
  }

  const handleMove = (index: number, dir: -1 | 1) => {
    const items = [...st.items]
    const other = index + dir
    if (other < 0 || other >= items.length) return
    const tmpOrder = items[index]!.sortOrder
    items[index] = { ...items[index]!, sortOrder: items[other]!.sortOrder }
    items[other] = { ...items[other]!, sortOrder: tmpOrder }
    items.sort((a, b) => a.sortOrder - b.sortOrder)
    st.setData(items, st.total)
    setReordering(true)
  }

  const handleSaveOrder = async () => {
    await groupsApi.reorder(st.items.map((g, i) => ({ id: g.id, sortOrder: i })))
    setReordering(false)
    void load()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">組別管理</h1>
        <div className="flex gap-2">
          {reordering && (
            <button onClick={handleSaveOrder} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer">
              儲存排序
            </button>
          )}
          <button onClick={() => { setEditing(null); setShowModal(true) }} className={BTN_PRIMARY}>+ 新增組別</button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={selectedDept} onChange={e => handleDeptChange(e.target.value)} className={SELECT_CLS}>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={isActive} onChange={e => handleIsActiveChange(e.target.value)} className={SELECT_CLS} style={{ width: 110 }}>
          <option value="">全部</option>
          <option value="true">啟用中</option>
          <option value="false">已停用</option>
        </select>
      </div>

      <TableControls
        search={st.search} onSearch={st.setSearch}
        total={st.total} page={st.page} totalPages={st.totalPages}
        setPage={st.setPage} pageSize={st.limit} onPageSize={st.setLimit}
        placeholder="搜尋組別名稱、代碼或製程階段..."
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-center px-2 py-3 font-semibold text-slate-600 w-16">排序</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">組別名稱</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">代碼</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">製程階段</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">說明</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {st.loading && <tr><td colSpan={7} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!st.loading && st.items.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-slate-400">尚無組別</td></tr>}
            {st.items.map((item, idx) => {
              const moved = reordering && originalOrder[idx] !== item.id
              return (
              <tr key={item.id} className={`border-b border-slate-100 hover:bg-slate-50 ${!item.isActive ? 'opacity-50' : ''} ${moved ? 'bg-blue-50' : ''}`}>
                <td className="px-2 py-3 text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <button
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-default text-xs px-1"
                    >▲</button>
                    <span className="text-xs text-slate-400 w-4 text-center">{idx + 1}</span>
                    <button
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === st.items.length - 1}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-default text-xs px-1"
                    >▼</button>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                <td className="px-4 py-3 font-mono text-slate-600">{item.code ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{item.stage ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{item.description ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {item.isActive ? '啟用' : '停用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => { setEditing(item); setShowModal(true) }} className="text-blue-600 hover:text-blue-800 text-xs font-medium cursor-pointer">編輯</button>
                  {item.isActive && <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 text-xs font-medium cursor-pointer">停用</button>}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <GroupModal
          depts={depts}
          defaultDeptId={selectedDept}
          group={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); void load() }}
        />
      )}
    </div>
  )
}

function GroupModal({ depts, defaultDeptId, group, onClose, onSaved }: {
  depts: Department[]; defaultDeptId: string; group: Group | null
  onClose: () => void; onSaved: () => void
}) {
  const [deptId, setDeptId] = useState(group?.departmentId ?? defaultDeptId)
  const [name, setName] = useState(group?.name ?? '')
  const [code, setCode] = useState(group?.code ?? '')
  const [stage, setStage] = useState(group?.stage ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { setError('請填寫組別名稱'); return }
    setSaving(true); setError(null)
    try {
      if (group) {
        await groupsApi.update(group.id, { name, code: code || null, stage: stage || null, description: description || null })
      } else {
        await groupsApi.create({ departmentId: deptId, name, code: code || null, stage: stage || null, description: description || null })
      }
      onSaved()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg">{group ? '編輯組別' : '新增組別'}</h2>
        <div className="space-y-3">
          {!group && <Field label="產線"><select value={deptId} onChange={e => setDeptId(e.target.value)} className={SELECT_CLS}>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>}
          <Field label="組別名稱"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} placeholder="SMT 組" /></Field>
          <Field label="代碼（選填）"><input value={code} onChange={e => setCode(e.target.value)} className={INPUT_CLS} placeholder="SMT" /></Field>
          <Field label="製程階段（選填）"><input value={stage} onChange={e => setStage(e.target.value)} className={INPUT_CLS} placeholder="貼合/壓合" /></Field>
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

const SELECT_CLS = 'border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const INPUT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer'
