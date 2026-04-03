import { useState, useEffect, useCallback } from 'react'
import { routesApi, stationsApi, departmentsApi, ProcessRoute, ProcessStep, Station, Department } from '../../api/admin'

export function RoutesPage() {
  const [depts, setDepts] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState('')
  const [items, setItems] = useState<ProcessRoute[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ProcessRoute | null>(null)
  const [stepsRoute, setStepsRoute] = useState<ProcessRoute | null>(null)

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
      const data = await routesApi.listByDept(selectedDept)
      setItems(data)
    } finally {
      setLoading(false)
    }
  }, [selectedDept])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('確定停用此路由？')) return
    await routesApi.delete(id)
    load()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">工序路由</h1>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className={BTN_PRIMARY}>+ 新增路由</button>
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
              <th className="text-left px-4 py-3 font-semibold text-slate-600">路由名稱</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">版本</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">說明</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">尚無路由</td></tr>}
            {items.map(item => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                <td className="px-4 py-3 text-slate-600">v{item.version}</td>
                <td className="px-4 py-3 text-slate-500">{item.description ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {item.isActive ? '啟用' : '停用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => setStepsRoute(item)} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium cursor-pointer">管理步驟</button>
                  <button onClick={() => { setEditing(item); setShowModal(true) }} className="text-blue-600 hover:text-blue-800 text-xs font-medium cursor-pointer">編輯</button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 text-xs font-medium cursor-pointer">停用</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <RouteModal
          depts={depts}
          defaultDeptId={selectedDept}
          route={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}

      {stepsRoute && (
        <StepsModal
          route={stepsRoute}
          deptId={selectedDept}
          onClose={() => setStepsRoute(null)}
        />
      )}
    </div>
  )
}

// ── RouteModal ────────────────────────────────────────────────────────────────

function RouteModal({ depts, defaultDeptId, route, onClose, onSaved }: {
  depts: Department[]; defaultDeptId: string; route: ProcessRoute | null
  onClose: () => void; onSaved: () => void
}) {
  const [deptId, setDeptId] = useState(route?.departmentId ?? defaultDeptId)
  const [name, setName] = useState(route?.name ?? '')
  const [description, setDescription] = useState(route?.description ?? '')
  const [version, setVersion] = useState(route?.version ?? 1)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { setError('請填寫路由名稱'); return }
    setSaving(true)
    setError(null)
    try {
      if (route) {
        await routesApi.update(route.id, { name, description: description || null })
      } else {
        await routesApi.create({ departmentId: deptId, name, description: description || null, version })
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalWrapper title={route ? '編輯路由' : '新增路由'}>
      <div className="space-y-3">
        {!route && (
          <Field label="部門">
            <select value={deptId} onChange={e => setDeptId(e.target.value)} className={SELECT_CLS}>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </Field>
        )}
        <Field label="路由名稱"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} placeholder="標準生產路由" /></Field>
        {!route && <Field label="版本號"><input type="number" min={1} value={version} onChange={e => setVersion(Number(e.target.value))} className={INPUT_CLS} /></Field>}
        <Field label="說明（選填）"><input value={description} onChange={e => setDescription(e.target.value)} className={INPUT_CLS} /></Field>
      </div>
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      <ModalActions onClose={onClose} onSave={handleSave} saving={saving} />
    </ModalWrapper>
  )
}

// ── StepsModal ────────────────────────────────────────────────────────────────

function StepsModal({ route, deptId, onClose }: { route: ProcessRoute; deptId: string; onClose: () => void }) {
  const [steps, setSteps] = useState<ProcessStep[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [addStationId, setAddStationId] = useState('')
  const [addStdTime, setAddStdTime] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadSteps = useCallback(async () => {
    const data = await routesApi.steps(route.id)
    setSteps(data)
    if (data.length > 0) return
  }, [route.id])

  useEffect(() => {
    Promise.all([
      loadSteps(),
      stationsApi.listByDept(deptId).then(d => { setStations(d); setAddStationId(d[0]?.id ?? '') }),
    ]).finally(() => setLoading(false))
  }, [loadSteps, deptId])

  const handleAdd = async () => {
    if (!addStationId) return
    const nextOrder = steps.length > 0 ? Math.max(...steps.map(s => s.stepOrder)) + 1 : 1
    setError(null)
    try {
      await routesApi.addStep(route.id, {
        stationId: addStationId,
        stepOrder: nextOrder,
        standardTime: addStdTime ? Number(addStdTime) : null,
      })
      await loadSteps()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDelete = async (stepId: string) => {
    await routesApi.deleteStep(route.id, stepId)
    await loadSteps()
  }

  const handleMoveUp = async (step: ProcessStep, index: number) => {
    if (index === 0) return
    const prev = steps[index - 1]!
    await Promise.all([
      routesApi.updateStep(route.id, step.id, { stepOrder: prev.stepOrder }),
      routesApi.updateStep(route.id, prev.id, { stepOrder: step.stepOrder }),
    ])
    await loadSteps()
  }

  const handleMoveDown = async (step: ProcessStep, index: number) => {
    if (index === steps.length - 1) return
    const next = steps[index + 1]!
    await Promise.all([
      routesApi.updateStep(route.id, step.id, { stepOrder: next.stepOrder }),
      routesApi.updateStep(route.id, next.id, { stepOrder: step.stepOrder }),
    ])
    await loadSteps()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-lg">步驟管理 — {route.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer text-xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-400">載入中...</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {steps.length === 0 ? (
              <p className="text-center text-slate-400 py-8">尚無步驟，請新增</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-slate-600 font-semibold">順序</th>
                    <th className="text-left px-3 py-2 text-slate-600 font-semibold">站點</th>
                    <th className="text-left px-3 py-2 text-slate-600 font-semibold">標準工時(s)</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step, i) => (
                    <tr key={step.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500">
                        <div className="flex items-center gap-1">
                          <span className="w-6 text-center">{step.stepOrder}</span>
                          <div className="flex flex-col gap-0.5">
                            <button onClick={() => handleMoveUp(step, i)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer text-xs leading-none">▲</button>
                            <button onClick={() => handleMoveDown(step, i)} disabled={i === steps.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer text-xs leading-none">▼</button>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-800 font-medium">{step.stationName}{step.stationCode ? ` (${step.stationCode})` : ''}</td>
                      <td className="px-3 py-2 text-slate-600">{step.standardTime ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => handleDelete(step.id)} className="text-red-500 hover:text-red-700 text-xs cursor-pointer">刪除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Add step */}
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-sm font-medium text-slate-700">新增步驟</p>
          <div className="flex gap-2">
            <select value={addStationId} onChange={e => setAddStationId(e.target.value)} className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
              {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="number" min={0} value={addStdTime} onChange={e => setAddStdTime(e.target.value)} placeholder="標準工時(s)" className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors">新增</button>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────

function ModalWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function ModalActions({ onClose, onSave, saving }: { onClose: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">取消</button>
      <button onClick={onSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">{saving ? '儲存中...' : '儲存'}</button>
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
