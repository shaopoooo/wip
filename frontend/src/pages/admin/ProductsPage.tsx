import { useState, useEffect, useCallback } from 'react'
import {
  productsApi, routesApi, stationsApi, categoriesApi, departmentsApi,
  Product, ProductCategory, ProcessRoute, ProcessStep, Station, Department,
} from '../../api/admin'
import { useServerTable } from '../../hooks/useServerTable'
import { TableControls, SortTh } from '../../components/TableControls'

export function ProductsPage() {
  const [depts, setDepts] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState('')
  const [categories, setCategories] = useState<ProductCategory[]>([])

  useEffect(() => {
    departmentsApi.list().then(d => {
      setDepts(d)
      if (d.length > 0) setSelectedDept(d[0]!.id)
    }).catch(() => {})
    categoriesApi.listAll().then(setCategories).catch(() => {})
  }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-800">產品型號管理</h1>
        <select
          value={selectedDept}
          onChange={e => setSelectedDept(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500 w-44"
        >
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {selectedDept && (
        <ProductsTable deptId={selectedDept} depts={depts} categories={categories} />
      )}
    </div>
  )
}

// ── Products Table ─────────────────────────────────────────────────────────────

function ProductsTable({ deptId, depts, categories }: {
  deptId: string; depts: Department[]; categories: ProductCategory[]
}) {
  const st = useServerTable<Product>({ defaultLimit: 25 })
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [stepsProduct, setStepsProduct] = useState<Product | null>(null)
  const [templates, setTemplates] = useState<ProcessRoute[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [routeFilter, setRouteFilter] = useState<'all' | 'set' | 'unset'>('all')

  const load = useCallback(async () => {
    st.setLoading(true)
    try {
      const [result, tpls] = await Promise.all([
        productsApi.list(deptId, {
          ...st.params,
          categoryId: categoryFilter || undefined,
          routeFilter: routeFilter !== 'all' ? routeFilter : undefined,
          isActive: statusFilter !== 'all' ? (statusFilter === 'active' ? 'true' : 'false') : undefined,
        }),
        routesApi.listTemplates(deptId),
      ])
      st.setData(result.items, result.total)
      setTemplates(tpls)
    } catch { } finally { st.setLoading(false) }
  }, [st.params, deptId, categoryFilter, routeFilter, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const handleStatusChange = (val: string) => { setStatusFilter(val as typeof statusFilter); st.setPage(1) }
  const handleCategoryChange = (val: string) => { setCategoryFilter(val); st.setPage(1) }
  const handleRouteFilterChange = (val: string) => { setRouteFilter(val as typeof routeFilter); st.setPage(1) }

  const handleDelete = async (id: string) => {
    if (!confirm('確定停用此產品？')) return
    await productsApi.delete(id)
    void load()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <select value={statusFilter} onChange={e => handleStatusChange(e.target.value)} className={SELECT_CLS} style={{ width: 100 }}>
            <option value="all">全部</option>
            <option value="active">啟用中</option>
            <option value="inactive">已停用</option>
          </select>
          <select value={categoryFilter} onChange={e => handleCategoryChange(e.target.value)} className={SELECT_CLS}>
            <option value="">全部種類</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={routeFilter} onChange={e => handleRouteFilterChange(e.target.value)} className={SELECT_CLS}>
            <option value="all">全部製程</option>
            <option value="set">已設定製程</option>
            <option value="unset">未設定製程</option>
          </select>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className={BTN_PRIMARY}>+ 新增產品</button>
      </div>

      <TableControls
        search={st.search} onSearch={st.setSearch}
        total={st.total} page={st.page} totalPages={st.totalPages}
        setPage={st.setPage} pageSize={st.limit} onPageSize={st.setLimit}
        placeholder="搜尋名稱或物料編號..."
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <SortTh col="model_number" label="物料編號" sortBy={st.sortBy} sortDir={st.sortDir} toggleSort={st.toggleSort} />
              <SortTh col="name" label="產品名稱" sortBy={st.sortBy} sortDir={st.sortDir} toggleSort={st.toggleSort} />
              <th className="text-left px-4 py-3 font-semibold text-slate-600">種類</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">製程模板</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {st.loading && <tr><td colSpan={6} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!st.loading && st.items.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-400">尚無產品</td></tr>}
            {st.items.map(item => (
              <tr key={item.id} className={`border-b border-slate-100 hover:bg-slate-50 ${!item.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-mono font-semibold text-slate-700">{item.modelNumber}</td>
                <td className="px-4 py-3 text-slate-800">{item.name}</td>
                <td className="px-4 py-3 text-slate-500">{item.categoryName ?? '—'}</td>
                <td className="px-4 py-3">
                  {item.routeId ? (
                    <button
                      onClick={() => setStepsProduct(item)}
                      className="text-emerald-600 hover:text-emerald-800 text-sm font-medium cursor-pointer"
                    >
                      {(item.routeName ?? '查看步驟').replace('【模板】', '')} →
                    </button>
                  ) : (
                    <button
                      onClick={() => { setEditing(item); setShowModal(true) }}
                      className="text-blue-500 hover:text-blue-700 text-xs font-medium cursor-pointer"
                    >
                      + 選擇模板
                    </button>
                  )}
                </td>
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
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ProductModal
          depts={depts}
          defaultDeptId={deptId}
          product={editing}
          categories={categories}
          templates={templates}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); void load() }}
        />
      )}

      {stepsProduct?.routeId && (
        <StepsModal
          routeId={stepsProduct.routeId}
          routeName={stepsProduct.routeName ?? stepsProduct.modelNumber}
          isTemplate={templates.some(t => t.id === stepsProduct.routeId)}
          deptId={deptId}
          templates={templates}
          onClose={() => setStepsProduct(null)}
        />
      )}
    </>
  )
}

// ── Product Modal ──────────────────────────────────────────────────────────────

function ProductModal({ depts, defaultDeptId, product, categories, templates, onClose, onSaved }: {
  depts: Department[]; defaultDeptId: string; product: Product | null
  categories: ProductCategory[]; templates: ProcessRoute[]
  onClose: () => void; onSaved: () => void
}) {
  const [deptId, setDeptId] = useState(product?.departmentId ?? defaultDeptId)
  const [name, setName] = useState(product?.name ?? '')
  const [modelNumber, setModelNumber] = useState(product?.modelNumber ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '')
  const [routeId, setRouteId] = useState(product?.routeId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !modelNumber.trim()) { setError('請填寫產品名稱與物料編號'); return }
    setSaving(true); setError(null)
    try {
      if (product) {
        await productsApi.update(product.id, {
          name, modelNumber, description: description || null,
          categoryId: categoryId || null, routeId: routeId || null,
        })
      } else {
        await productsApi.create({
          departmentId: deptId, name, modelNumber, description: description || null,
          categoryId: categoryId || null, routeId: routeId || null,
        })
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
        <h2 className="font-bold text-slate-800 text-lg">{product ? '編輯產品' : '新增產品'}</h2>
        <div className="space-y-3">
          {!product && (
            <Field label="產線">
              <select value={deptId} onChange={e => setDeptId(e.target.value)} className={SELECT_CLS}>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="產品名稱"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} placeholder="FPC 軟板 A款" /></Field>
          <Field label="物料編號"><input value={modelNumber} onChange={e => setModelNumber(e.target.value)} className={INPUT_CLS} placeholder="FPC-A-001" /></Field>
          <Field label="說明（選填）"><input value={description} onChange={e => setDescription(e.target.value)} className={INPUT_CLS} /></Field>
          <Field label="產品種類（選填）">
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={SELECT_CLS}>
              <option value="">— 未設定 —</option>
              {categories.filter(c => c.isActive).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="製程模板（選填）">
            <select value={routeId} onChange={e => setRouteId(e.target.value)} className={SELECT_CLS}>
              <option value="">— 未設定 —</option>
              {templates.filter(r => r.isActive).map(r => (
                <option key={r.id} value={r.id}>{r.name.replace('【模板】', '')}</option>
              ))}
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

// ── Steps Modal ────────────────────────────────────────────────────────────────

function StepsModal({ routeId, routeName, isTemplate, deptId, templates, onClose }: {
  routeId: string; routeName: string; isTemplate: boolean
  deptId: string; templates: ProcessRoute[]; onClose: () => void
}) {
  const [steps, setSteps] = useState<ProcessStep[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [addStationId, setAddStationId] = useState('')
  const [addStdTime, setAddStdTime] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStationId, setEditStationId] = useState('')
  const [editStdTime, setEditStdTime] = useState('')
  const [applyTemplateId, setApplyTemplateId] = useState(templates[0]?.id ?? '')
  const [applying, setApplying] = useState(false)

  const loadSteps = useCallback(async () => {
    const data = await routesApi.steps(routeId)
    setSteps(data)
  }, [routeId])

  useEffect(() => {
    Promise.all([
      loadSteps(),
      stationsApi.listAll(deptId).then(d => {
        const active = d.filter(s => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        setStations(active)
        setAddStationId(active[0]?.id ?? '')
      }),
    ]).finally(() => setLoading(false))
  }, [loadSteps, deptId])

  useEffect(() => {
    if (templates.length > 0 && !applyTemplateId) {
      setApplyTemplateId(templates[0]!.id)
    }
  }, [templates, applyTemplateId])

  const handleAdd = async () => {
    if (!addStationId) return
    const nextOrder = steps.length > 0 ? Math.max(...steps.map(s => s.stepOrder)) + 1 : 1
    setError(null)
    try {
      await routesApi.addStep(routeId, {
        stationId: addStationId, stepOrder: nextOrder,
        standardTime: addStdTime ? Number(addStdTime) : null,
      })
      await loadSteps()
      setAddStdTime('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDelete = async (stepId: string) => {
    if (!confirm('確定刪除此製程步驟？')) return
    await routesApi.deleteStep(routeId, stepId)
    await loadSteps()
  }

  const handleMove = async (step: ProcessStep, index: number, dir: 1 | -1) => {
    const other = steps[index + dir]!
    await Promise.all([
      routesApi.updateStep(routeId, step.id, { stepOrder: other.stepOrder }),
      routesApi.updateStep(routeId, other.id, { stepOrder: step.stepOrder }),
    ])
    await loadSteps()
  }

  const startEdit = (step: ProcessStep) => {
    setEditingId(step.id)
    setEditStationId(step.stationId)
    setEditStdTime(step.standardTime != null ? String(step.standardTime) : '')
  }

  const handleSaveEdit = async (step: ProcessStep) => {
    setError(null)
    try {
      await routesApi.updateStep(routeId, step.id, {
        stationId: editStationId,
        standardTime: editStdTime ? Number(editStdTime) : null,
      })
      setEditingId(null)
      await loadSteps()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleApplyTemplate = async () => {
    if (!applyTemplateId) return
    const tplName = templates.find(t => t.id === applyTemplateId)?.name.replace('【模板】', '') ?? '選定模板'
    if (!confirm(`確定套用「${tplName}」的步驟？目前所有步驟將被替換。`)) return
    setApplying(true)
    setError(null)
    try {
      const templateSteps = await routesApi.steps(applyTemplateId)
      for (const step of steps) {
        await routesApi.deleteStep(routeId, step.id)
      }
      for (const step of templateSteps) {
        await routesApi.addStep(routeId, {
          stationId: step.stationId,
          stepOrder: step.stepOrder,
          standardTime: step.standardTime,
        })
      }
      await loadSteps()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">製程步驟 — {routeName.replace('【模板】', '')}</h2>
            {isTemplate && (
              <p className="text-xs text-amber-600 font-medium mt-0.5">此為模板，修改將影響所有使用此模板的產品</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer text-xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-400">載入中...</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {steps.length === 0 ? (
              <p className="text-center text-slate-400 py-8">尚無步驟，請新增或套用模板</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-slate-600 font-semibold w-16">順序</th>
                    <th className="text-left px-3 py-2 text-slate-600 font-semibold">站點</th>
                    <th className="text-left px-3 py-2 text-slate-600 font-semibold w-28">標準工時(s)</th>
                    <th className="px-3 py-2 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step, i) => (
                    <tr key={step.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500">
                        <div className="flex items-center gap-1">
                          <span className="w-6 text-center">{step.stepOrder}</span>
                          <div className="flex flex-col gap-0.5">
                            <button onClick={() => handleMove(step, i, -1)} disabled={i === 0 || editingId !== null} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer text-xs leading-none">&#x25B2;</button>
                            <button onClick={() => handleMove(step, i, 1)} disabled={i === steps.length - 1 || editingId !== null} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer text-xs leading-none">&#x25BC;</button>
                          </div>
                        </div>
                      </td>
                      {editingId === step.id ? (
                        <>
                          <td className="px-3 py-1.5">
                            <select value={editStationId} onChange={e => setEditStationId(e.target.value)} className="w-full border border-blue-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-blue-500">
                              {stations.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" min={0} value={editStdTime} onChange={e => setEditStdTime(e.target.value)} placeholder="—" className="w-full border border-blue-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-blue-500" />
                          </td>
                          <td className="px-3 py-1.5 text-right space-x-2">
                            <button onClick={() => handleSaveEdit(step)} className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold cursor-pointer">儲存</button>
                            <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">取消</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-slate-800 font-medium">{step.stationName}{step.stationCode ? ` (${step.stationCode})` : ''}</td>
                          <td className="px-3 py-2 text-slate-600">{step.standardTime ?? '—'}</td>
                          <td className="px-3 py-2 text-right space-x-3">
                            <button onClick={() => startEdit(step)} disabled={editingId !== null} className="text-blue-600 hover:text-blue-800 text-xs font-medium cursor-pointer disabled:opacity-40">編輯</button>
                            <button onClick={() => handleDelete(step.id)} disabled={editingId !== null} className="text-red-500 hover:text-red-700 text-xs cursor-pointer disabled:opacity-40">刪除</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Add step */}
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-sm font-medium text-slate-700">新增製程步驟</p>
          {stations.length === 0 ? (
            <p className="text-sm text-slate-400">此產線尚無站點，請先至「站點管理」建立。</p>
          ) : (
            <div className="flex gap-2">
              <select value={addStationId} onChange={e => setAddStationId(e.target.value)} className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                {stations.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
              </select>
              <input type="number" min={0} value={addStdTime} onChange={e => setAddStdTime(e.target.value)} placeholder="標準工時(s)" className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors">新增</button>
            </div>
          )}
        </div>

        {/* Apply from template */}
        {templates.length > 0 && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-sm font-medium text-slate-700">套用模板步驟 <span className="text-slate-400 font-normal text-xs">（將取代目前所有步驟）</span></p>
            <div className="flex gap-2">
              <select
                value={applyTemplateId}
                onChange={e => setApplyTemplateId(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
              >
                {templates.map(t => <option key={t.id} value={t.id}>{t.name.replace('【模板】', '')}</option>)}
              </select>
              <button
                onClick={handleApplyTemplate}
                disabled={applying || !applyTemplateId}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
              >
                {applying ? '套用中...' : '套用'}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────

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
