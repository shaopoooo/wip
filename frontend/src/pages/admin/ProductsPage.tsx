import { useState, useEffect, useCallback } from 'react'
import {
  productsApi, routesApi, stationsApi, departmentsApi,
  Product, ProcessRoute, ProcessStep, Station, Department,
  TemplateType, TEMPLATE_TYPE_LABELS,
} from '../../api/admin'
import { useServerTable } from '../../hooks/useServerTable'
import { TableControls, SortTh } from '../../components/TableControls'

export function ProductsPage() {
  const [depts, setDepts] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    departmentsApi.list().then(d => {
      setDepts(d)
      if (d.length > 0) setSelectedDept(d[0]!.id)
    }).catch(() => { })
    // categoriesApi.listAll() — 功能保留，UI 隱藏，啟用時取消註解
  }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">產品型號</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTemplateManager(true)}
            className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
          >
            管理模板
          </button>
          <button
            onClick={() => { setEditing(null); setShowModal(true) }}
            className={BTN_PRIMARY}
          >
            + 新增產品
          </button>
        </div>
      </div>

      {selectedDept && (
        <ProductsTable
          key={reloadKey}
          deptId={selectedDept}
          depts={depts}
          selectedDept={selectedDept}
          onDeptChange={setSelectedDept}
          showModal={showModal}
          setShowModal={setShowModal}
          editing={editing}
          setEditing={setEditing}
        />
      )}

      {showTemplateManager && selectedDept && (
        <TemplateManagerModal
          deptId={selectedDept}
          depts={depts}
          onClose={() => { setShowTemplateManager(false); setReloadKey(k => k + 1) }}
        />
      )}
    </div>
  )
}

// ── Products Table ─────────────────────────────────────────────────────────────

function ProductsTable({ deptId, depts, selectedDept, onDeptChange, showModal, setShowModal, editing, setEditing }: {
  deptId: string; depts: Department[]
  selectedDept: string; onDeptChange: (id: string) => void
  showModal: boolean; setShowModal: (v: boolean) => void
  editing: Product | null; setEditing: (p: Product | null) => void
}) {
  const st = useServerTable<Product>({ defaultLimit: 25 })
  const [stepsProduct, setStepsProduct] = useState<Product | null>(null)
  const [templates, setTemplates] = useState<ProcessRoute[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [categoryFilter] = useState('')
  const [routeFilter, setRouteFilter] = useState<'all' | 'set' | 'unset'>('all')
  const [unsetCount, setUnsetCount] = useState(0)

  const load = useCallback(async () => {
    st.setLoading(true)
    try {
      const [result, tpls, unsetResult] = await Promise.all([
        productsApi.list(deptId, {
          ...st.params,
          categoryId: categoryFilter || undefined,
          routeFilter: routeFilter !== 'all' ? routeFilter : undefined,
          isActive: statusFilter !== 'all' ? (statusFilter === 'active' ? 'true' : 'false') : undefined,
        }),
        routesApi.listTemplates(deptId),
        productsApi.list(deptId, { page: 1, limit: 1, routeFilter: 'unset', isActive: 'true' }),
      ])
      st.setData(result.items, result.total)
      setTemplates(tpls)
      setUnsetCount(unsetResult.total)
    } catch { } finally { st.setLoading(false) }
  }, [st.params, deptId, categoryFilter, routeFilter, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const handleStatusChange = (val: string) => { setStatusFilter(val as typeof statusFilter); st.setPage(1) }
  const handleRouteFilterChange = (val: string) => { setRouteFilter(val as typeof routeFilter); st.setPage(1) }

  const handleDelete = async (id: string) => {
    if (!confirm('確定停用此產品？')) return
    await productsApi.delete(id)
    void load()
  }

  return (
    <>
      {unsetCount > 0 && routeFilter !== 'unset' && (
        <button
          onClick={() => { setRouteFilter('unset'); setStatusFilter('active'); st.setPage(1) }}
          className="w-full mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-amber-100 transition-colors cursor-pointer"
        >
          <span>{unsetCount} 個啟用中產品尚未設定製程，無法掃描報工</span>
          <span className="text-amber-600 text-xs font-semibold">點擊查看 →</span>
        </button>
      )}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={selectedDept} onChange={e => { onDeptChange(e.target.value); st.setPage(1) }} className={SELECT_CLS} style={{ maxWidth: 180 }}>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => handleStatusChange(e.target.value)} className={SELECT_CLS} style={{ width: 100 }}>
          <option value="all">全部</option>
          <option value="active">啟用中</option>
          <option value="inactive">已停用</option>
        </select>
        {/* 產品種類篩選（功能保留，UI 隱藏）— 啟用時取消註解並加回 handleCategoryChange */}
        <select value={routeFilter} onChange={e => handleRouteFilterChange(e.target.value)} className={SELECT_CLS}>
          <option value="all">全部製程</option>
          <option value="set">已設定製程</option>
          <option value="unset">未設定製程</option>
        </select>
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
              <th className="text-left px-4 py-3 font-semibold text-slate-600">製程</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {st.loading && <tr><td colSpan={5} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!st.loading && st.items.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">尚無產品</td></tr>}
            {st.items.map(item => (
              <tr key={item.id} className={`border-b border-slate-100 hover:bg-slate-50 ${!item.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-mono font-semibold text-slate-700">
                  {item.modelNumber}
                  <ModelNumberHint modelNumber={item.modelNumber} />
                </td>
                <td className="px-4 py-3 text-slate-800">{item.name}</td>
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
                      className="text-red-500 hover:text-red-700 text-xs font-semibold cursor-pointer"
                    >
                      ! 尚未設定製程
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
          templates={templates}
          deptId={deptId}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); void load() }}
        />
      )}

      {stepsProduct?.routeId && (
        <StepsModal
          routeId={stepsProduct.routeId}
          routeName={stepsProduct.modelNumber}
          isTemplate={templates.some(t => t.id === stepsProduct.routeId)}
          deptId={deptId}
          templates={templates}
          onClose={() => { setStepsProduct(null); void load() }}
        />
      )}
    </>
  )
}

// ── Product Modal ──────────────────────────────────────────────────────────────

function ProductModal({ depts, defaultDeptId, product, templates, deptId: parentDeptId, onClose, onSaved }: {
  depts: Department[]; defaultDeptId: string; product: Product | null
  templates: ProcessRoute[]
  deptId: string; onClose: () => void; onSaved: () => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null)
  const [savedRouteName, setSavedRouteName] = useState<string>('')
  const [deptId, setDeptId] = useState(product?.departmentId ?? defaultDeptId)
  const [name, setName] = useState(product?.name ?? '')
  const [modelNumber, setModelNumber] = useState(product?.modelNumber ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const categoryId = product?.categoryId ?? ''
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSaveStep1 = async () => {
    if (!name.trim() || !modelNumber.trim()) { setError('請填寫產品名稱與物料編號'); return }
    setSaving(true); setError(null)
    try {
      let productRouteId = product?.routeId ?? null
      if (product) {
        // If product has no route yet, create one first
        if (!productRouteId) {
          const route = await routesApi.create({
            departmentId: product.departmentId, name: modelNumber.trim(),
          })
          productRouteId = route.id
          await productsApi.update(product.id, {
            name, modelNumber, description: description || null,
            categoryId: categoryId || null, routeId: route.id,
          })
        } else {
          await productsApi.update(product.id, {
            name, modelNumber, description: description || null,
            categoryId: categoryId || null,
          })
          // sync route name when model number changed
          if (modelNumber.trim() !== product.modelNumber) {
            await routesApi.update(productRouteId, { name: modelNumber.trim() })
          }
        }
      } else {
        // create route for new product, then create product with routeId
        const route = await routesApi.create({
          departmentId: deptId, name: modelNumber.trim(),
        })
        productRouteId = route.id
        await productsApi.create({
          departmentId: deptId, name, modelNumber, description: description || null,
          categoryId: categoryId || null, routeId: route.id,
        })
      }
      setSavedRouteId(productRouteId)
      setSavedRouteName(modelNumber.trim())
      setStep(2)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (step === 2 && savedRouteId) {
    return (
      <StepsModal
        routeId={savedRouteId}
        routeName={savedRouteName}
        isTemplate={templates.some(t => t.id === savedRouteId)}
        deptId={parentDeptId}
        templates={templates}
        onClose={() => onSaved()}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="font-bold text-slate-800 text-lg">{product ? '編輯產品' : '新增產品'}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-blue-600">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">1</span>
              產品資料
            </span>
            <span className="text-slate-300">—</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-slate-400">
              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs">2</span>
              調整製程
            </span>
          </div>
        </div>
        <div className="space-y-3">
          {!product && (
            <Field label="產線">
              <select value={deptId} onChange={e => setDeptId(e.target.value)} className={SELECT_CLS}>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="產品名稱"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} placeholder="FPC 軟板 A款" /></Field>
          <Field label="物料編號">
            <input value={modelNumber} onChange={e => setModelNumber(e.target.value)} className={INPUT_CLS} placeholder="SA161A047B" />
            {modelNumber.trim() && (() => {
              const parts = parseModelNumber(modelNumber)
              if (!parts) return modelNumber.trim().length >= 6
                ? <p className="text-slate-400 text-[11px] mt-1">無法解析編碼規則</p>
                : null
              return (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] mt-1 text-slate-500">
                  <span><b className={parts.type === 'S' ? 'text-amber-600' : 'text-emerald-600'}>{parts.typeLabel}</b></span>
                  <span>種類 <b>{parts.category}</b></span>
                  <span>客戶 <b>{parts.customer}</b></span>
                  <span>序號 <b>{parts.seq}</b></span>
                  <span>版本 <b>{parts.version}</b> (第{parts.versionNum}版)</span>
                </div>
              )
            })()}
          </Field>
          <Field label="說明（選填）"><input value={description} onChange={e => setDescription(e.target.value)} className={INPUT_CLS} /></Field>
          {/* 產品種類（功能保留，UI 隱藏）— 啟用時取消註解並加回 setCategoryId + categories */}
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">取消</button>
          <button onClick={handleSaveStep1} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">{saving ? '儲存中...' : '下一步：調整製程'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Steps Modal ────────────────────────────────────────────────────────────────

function StepsModal({ routeId, routeName, isTemplate: _isTemplate, deptId, templates, onClose }: {
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
  const [saving, setSaving] = useState(false)

  // track original snapshot for diff
  const [originalSteps, setOriginalSteps] = useState<ProcessStep[]>([])
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set())
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  // steps pending creation (from template apply/insert, not yet saved to API)
  const [pendingAdds, setPendingAdds] = useState<Set<string>>(new Set())

  const loadSteps = useCallback(async () => {
    const data = await routesApi.steps(routeId)
    setSteps(data)
    setOriginalSteps(data)
    setDeletedIds(new Set())
    setEditedIds(new Set())
    setNewIds(new Set())
    setPendingAdds(new Set())
  }, [routeId])

  /** Reload steps but preserve newIds tracking for newly added items */
  const reloadKeepingNew = useCallback(async (prevIds: Set<string>) => {
    const data = await routesApi.steps(routeId)
    const addedIds = new Set<string>([...prevIds])
    for (const s of data) {
      if (!originalSteps.some(o => o.id === s.id) && !prevIds.has(s.id)) {
        addedIds.add(s.id)
      }
    }
    setSteps(data)
    setNewIds(addedIds)
    setDeletedIds(new Set())
    setEditedIds(new Set())
  }, [routeId, originalSteps])

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

  const isMoved = (step: ProcessStep) => {
    const orig = originalSteps.find(s => s.id === step.id)
    return orig !== undefined && orig.stepOrder !== step.stepOrder
  }

  const isDirty = deletedIds.size > 0 || editedIds.size > 0 || newIds.size > 0 || pendingAdds.size > 0 || steps.some(s => isMoved(s))

  const handleAdd = async () => {
    if (!addStationId) return
    const visibleSteps = steps.filter(s => !deletedIds.has(s.id))
    const nextOrder = visibleSteps.length > 0 ? Math.max(...visibleSteps.map(s => s.stepOrder)) + 1 : 1
    setError(null)

    // If there are pending (unsaved) steps, add locally to avoid reload wiping them
    if (pendingAdds.size > 0) {
      const tempId = `pending-${crypto.randomUUID()}`
      const station = stations.find(s => s.id === addStationId)
      const newStep: ProcessStep = {
        id: tempId,
        routeId,
        stationId: addStationId,
        stationName: station?.name ?? '',
        stationCode: station?.code ?? null,
        stepOrder: nextOrder,
        standardTime: addStdTime ? Number(addStdTime) : null,
        createdAt: new Date().toISOString(),
      }
      setSteps(prev => [...prev, newStep])
      setNewIds(prev => new Set(prev).add(tempId))
      setPendingAdds(prev => new Set(prev).add(tempId))
      setAddStdTime('')
      return
    }

    try {
      await routesApi.addStep(routeId, {
        stationId: addStationId, stepOrder: nextOrder,
        standardTime: addStdTime ? Number(addStdTime) : null,
      })
      await reloadKeepingNew(newIds)
      setAddStdTime('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDelete = (stepId: string) => {
    setDeletedIds(prev => new Set(prev).add(stepId))
  }

  const handleRestore = (stepId: string) => {
    setDeletedIds(prev => { const next = new Set(prev); next.delete(stepId); return next })
  }

  const handleMove = (step: ProcessStep, index: number, dir: 1 | -1) => {
    const visibleSteps = steps.filter(s => !deletedIds.has(s.id))
    const other = visibleSteps[index + dir]!
    setSteps(prev => prev.map(s => {
      if (s.id === step.id) return { ...s, stepOrder: other.stepOrder }
      if (s.id === other.id) return { ...s, stepOrder: step.stepOrder }
      return s
    }).sort((a, b) => a.stepOrder - b.stepOrder))
  }

  const startEdit = (step: ProcessStep) => {
    setEditingId(step.id)
    setEditStationId(step.stationId)
    setEditStdTime(step.standardTime != null ? String(step.standardTime) : '')
  }

  const handleConfirmEdit = (step: ProcessStep) => {
    const newStationId = editStationId
    const newStdTime = editStdTime ? Number(editStdTime) : null
    const station = stations.find(s => s.id === newStationId)
    setSteps(prev => prev.map(s =>
      s.id === step.id
        ? { ...s, stationId: newStationId, stationName: station?.name ?? s.stationName, stationCode: station?.code ?? s.stationCode, standardTime: newStdTime }
        : s
    ))
    setEditedIds(prev => new Set(prev).add(step.id))
    setEditingId(null)
  }

  const handleApplyTemplate = async () => {
    if (!applyTemplateId) return
    const tplName = templates.find(t => t.id === applyTemplateId)?.name.replace('【模板】', '') ?? '選定模板'
    if (!confirm(`確定取代為「${tplName}」的步驟？目前所有步驟將被刪除。`)) return
    setApplying(true)
    setError(null)
    try {
      const templateSteps = await routesApi.steps(applyTemplateId)
      // mark all server-side steps (original + previously added) for deletion
      const toDelete = new Set<string>()
      for (const s of originalSteps) toDelete.add(s.id)
      // also delete any previously added (already on server) steps
      for (const s of steps) {
        if (newIds.has(s.id) && !pendingAdds.has(s.id)) toDelete.add(s.id)
      }
      // build local pending steps from template
      const localSteps: ProcessStep[] = templateSteps.map((s, i) => {
        const tempId = `pending-${crypto.randomUUID()}`
        const station = stations.find(st => st.id === s.stationId)
        return {
          id: tempId,
          routeId,
          stationId: s.stationId,
          stationName: station?.name ?? s.stationName,
          stationCode: station?.code ?? s.stationCode,
          stepOrder: i + 1,
          standardTime: s.standardTime,

          createdAt: new Date().toISOString(),
        }
      })
      setSteps(localSteps)
      setDeletedIds(toDelete)
      setEditedIds(new Set())
      setNewIds(new Set(localSteps.map(s => s.id)))
      setPendingAdds(new Set(localSteps.map(s => s.id)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setApplying(false)
    }
  }

  const handleInsertTemplate = async () => {
    if (!applyTemplateId) return
    setApplying(true)
    setError(null)
    try {
      const templateSteps = await routesApi.steps(applyTemplateId)
      const visibleSteps = steps.filter(s => !deletedIds.has(s.id))
      const maxOrder = visibleSteps.length > 0 ? Math.max(...visibleSteps.map(s => s.stepOrder)) : 0
      const localSteps: ProcessStep[] = templateSteps.map((s, i) => {
        const tempId = `pending-${crypto.randomUUID()}`
        const station = stations.find(st => st.id === s.stationId)
        return {
          id: tempId,
          routeId,
          stationId: s.stationId,
          stationName: station?.name ?? s.stationName,
          stationCode: station?.code ?? s.stationCode,
          stepOrder: maxOrder + i + 1,
          standardTime: s.standardTime,

          createdAt: new Date().toISOString(),
        }
      })
      setSteps(prev => [...prev, ...localSteps])
      setNewIds(prev => { const n = new Set(prev); localSteps.forEach(s => n.add(s.id)); return n })
      setPendingAdds(prev => { const n = new Set(prev); localSteps.forEach(s => n.add(s.id)); return n })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setApplying(false)
    }
  }

  const handleSaveAll = async () => {
    setSaving(true)
    setError(null)
    try {
      // sync route name to match model number
      await routesApi.update(routeId, { name: routeName })

      if (isDirty) {
        // 1. delete
        for (const id of deletedIds) {
          await routesApi.deleteStep(routeId, id)
        }
        // 2. create pending steps (from template apply/insert)
        const remaining = steps.filter(s => !deletedIds.has(s.id))
        for (const step of remaining) {
          if (pendingAdds.has(step.id)) {
            await routesApi.addStep(routeId, {
              stationId: step.stationId,
              stepOrder: step.stepOrder,
              standardTime: step.standardTime,
            })
            continue
          }
          // 3. update existing (order + edited fields)
          const orig = originalSteps.find(s => s.id === step.id)
          const orderChanged = orig && orig.stepOrder !== step.stepOrder
          const wasEdited = editedIds.has(step.id)
          if (orderChanged || wasEdited) {
            await routesApi.updateStep(routeId, step.id, {
              stepOrder: step.stepOrder,
              stationId: step.stationId,
              standardTime: step.standardTime,
            })
          }
        }
      }
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
        {/* 1. Title */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">製程步驟 — {routeName.replace('【模板】', '')}</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="flex items-center gap-1 text-xs font-semibold text-slate-400">
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs">1</span>
                產品資料
              </span>
              <span className="text-slate-300">—</span>
              <span className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">2</span>
                調整製程
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer text-xl leading-none">&times;</button>
        </div>

        {/* 2. Apply from template */}
        {templates.length > 0 && (
          <div className="border-b border-slate-100 pb-3 space-y-2">
            <p className="text-sm font-medium text-slate-700">套用模板步驟</p>
            <div className="flex gap-2">
              <select
                value={applyTemplateId}
                onChange={e => setApplyTemplateId(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
              >
                {templates.map(t => <option key={t.id} value={t.id}>{t.name.replace('【模板】', '')}</option>)}
              </select>
              <button
                onClick={handleInsertTemplate}
                disabled={applying || !applyTemplateId}
                className="border border-blue-300 hover:bg-blue-50 text-blue-600 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50"
              >
                插入
              </button>
              <button
                onClick={handleApplyTemplate}
                disabled={applying || !applyTemplateId}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
              >
                {applying ? '處理中...' : '取代'}
              </button>
            </div>
          </div>
        )}

        {/* 3. Table */}
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
                  {steps.map((step, _i) => {
                    const deleted = deletedIds.has(step.id)
                    const isNew = newIds.has(step.id)
                    const edited = editedIds.has(step.id)
                    const moved = isMoved(step)
                    const visibleSteps = steps.filter(s => !deletedIds.has(s.id))
                    const visibleIdx = visibleSteps.findIndex(s => s.id === step.id)
                    const rowBg = deleted ? 'bg-red-50' : isNew ? 'bg-emerald-50' : edited ? 'bg-blue-50' : moved ? 'bg-amber-50' : ''
                    return (
                      <tr key={step.id} className={`border-t border-slate-100 transition-colors duration-200 ${rowBg} ${deleted ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2 text-slate-500">
                          {deleted ? (
                            <span className="w-6 text-center line-through">{step.stepOrder}</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="w-6 text-center">{step.stepOrder}</span>
                              <div className="flex flex-col gap-0.5">
                                <button onClick={() => handleMove(step, visibleIdx, -1)} disabled={visibleIdx === 0 || editingId !== null} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer text-xs leading-none">&#x25B2;</button>
                                <button onClick={() => handleMove(step, visibleIdx, 1)} disabled={visibleIdx === visibleSteps.length - 1 || editingId !== null} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer text-xs leading-none">&#x25BC;</button>
                              </div>
                            </div>
                          )}
                        </td>
                        {!deleted && editingId === step.id ? (
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
                              <button onClick={() => handleConfirmEdit(step)} className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold cursor-pointer">確認</button>
                              <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">取消</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className={`px-3 py-2 font-medium ${deleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{step.stationName}{step.stationCode ? ` (${step.stationCode})` : ''}</td>
                            <td className={`px-3 py-2 ${deleted ? 'text-slate-400 line-through' : 'text-slate-600'}`}>{step.standardTime ?? '—'}</td>
                            <td className="px-3 py-2 text-right space-x-3">
                              {deleted ? (
                                <button onClick={() => handleRestore(step.id)} className="text-blue-600 hover:text-blue-800 text-xs font-semibold cursor-pointer">還原</button>
                              ) : (
                                <>
                                  <button onClick={() => startEdit(step)} disabled={editingId !== null} className="text-blue-600 hover:text-blue-800 text-xs font-medium cursor-pointer disabled:opacity-40">編輯</button>
                                  <button onClick={() => handleDelete(step.id)} disabled={editingId !== null} className="text-red-500 hover:text-red-700 text-xs cursor-pointer disabled:opacity-40">刪除</button>
                                </>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 4. Add step */}
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

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {/* 5. Save */}
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button onClick={handleSaveAll} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">
            {saving ? '儲存中...' : isDirty ? '儲存變更' : '完成'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Template Manager Modal ────────────────────────────────────────────────────

const TEMPLATE_TYPES: { value: TemplateType; label: string }[] = [
  { value: 'single_sided', label: '單面板' },
  { value: 'double_sided', label: '雙面板' },
  { value: 'multi_layer', label: '多層板' },
  { value: 'rigid_flex', label: '軟硬結合板' },
]

const TEMPLATE_COLORS: Record<string, { bg: string; border: string; badge: string }> = {
  single_sided: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  double_sided: { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
  multi_layer: { bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700' },
  rigid_flex: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
}

function TemplateManagerModal({ deptId, depts, onClose }: {
  deptId: string; depts: Department[]; onClose: () => void
}) {
  const [templates, setTemplates] = useState<ProcessRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTpl, setEditingTpl] = useState<ProcessRoute | null>(null)
  const [stepsTarget, setStepsTarget] = useState<ProcessRoute | null>(null)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const result = await routesApi.list(deptId, { page: 1, limit: 100, isTemplate: 'true' })
      setTemplates(result.items)
    } catch { } finally { setLoading(false) }
  }, [deptId])

  useEffect(() => { void loadTemplates() }, [loadTemplates])

  const handleDeactivate = async (tpl: ProcessRoute) => {
    if (!confirm(`確定停用模板「${tpl.name.replace('【模板】', '')}」？`)) return
    await routesApi.update(tpl.id, { isActive: false })
    void loadTemplates()
  }

  if (stepsTarget) {
    return (
      <StepsModal
        routeId={stepsTarget.id}
        routeName={stepsTarget.name}
        isTemplate={true}
        deptId={deptId}
        templates={templates}
        onClose={() => setStepsTarget(null)}
      />
    )
  }

  if (showForm) {
    return (
      <TemplateFormModal
        depts={depts}
        defaultDeptId={deptId}
        template={editingTpl}
        onClose={() => { setShowForm(false); setEditingTpl(null) }}
        onSaved={() => { setShowForm(false); setEditingTpl(null); void loadTemplates() }}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-lg">製程模板管理</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setEditingTpl(null); setShowForm(true) }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 border border-blue-300 hover:border-blue-500 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
            >
              + 新增模板
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && <p className="text-slate-400 text-sm text-center py-8">載入中...</p>}
          {!loading && templates.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-8">尚無模板，點擊右上角「+ 新增模板」開始建立</p>
          )}
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {templates.map(tpl => {
                const color = TEMPLATE_COLORS[tpl.templateType ?? ''] ?? TEMPLATE_COLORS['single_sided']!
                return (
                  <div key={tpl.id} className={`rounded-xl border p-4 space-y-3 ${color.bg} ${color.border} ${!tpl.isActive ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800 text-sm leading-snug">{tpl.name.replace('【模板】', '')}</p>
                      {tpl.templateType && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${color.badge}`}>
                          {TEMPLATE_TYPE_LABELS[tpl.templateType]}
                        </span>
                      )}
                    </div>
                    {tpl.description && <p className="text-xs text-slate-500">{tpl.description}</p>}
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        onClick={() => setStepsTarget(tpl)}
                        className="col-span-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        管理步驟
                      </button>
                      <button
                        onClick={() => { setEditingTpl(tpl); setShowForm(true) }}
                        className="bg-white border border-blue-300 hover:bg-blue-50 text-blue-600 text-xs font-semibold py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        編輯
                      </button>
                      {tpl.isActive && (
                        <button
                          onClick={() => handleDeactivate(tpl)}
                          className="bg-white border border-slate-200 hover:bg-red-50 text-slate-400 hover:text-red-500 text-xs font-semibold py-1.5 rounded-lg cursor-pointer transition-colors"
                        >
                          停用
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TemplateFormModal({ depts, defaultDeptId, template, onClose, onSaved }: {
  depts: Department[]; defaultDeptId: string; template: ProcessRoute | null
  onClose: () => void; onSaved: () => void
}) {
  const [deptId, setDeptId] = useState(template?.departmentId ?? defaultDeptId)
  const [name, setName] = useState(template?.name.replace('【模板】', '') ?? '')
  const [templateType, setTemplateType] = useState<TemplateType | ''>(template?.templateType ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { setError('請填寫模板名稱'); return }
    setSaving(true); setError(null)
    try {
      const fullName = `【模板】${name.trim()}`
      if (template) {
        await routesApi.update(template.id, {
          name: fullName,
          description: description || null,
          templateType: templateType || null,
        })
      } else {
        await routesApi.create({
          departmentId: deptId,
          name: fullName,
          description: description || null,
          isTemplate: true,
          templateType: templateType || null,
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
        <h2 className="font-bold text-slate-800 text-lg">{template ? '編輯模板' : '新增模板'}</h2>
        <div className="space-y-3">
          {!template && (
            <Field label="部門">
              <select value={deptId} onChange={e => setDeptId(e.target.value)} className={SELECT_CLS}>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="模板名稱">
            <div className="flex items-center gap-1">
              <span className="text-sm text-slate-400 whitespace-nowrap">【模板】</span>
              <input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} placeholder="雙面板標準製程" autoFocus />
            </div>
          </Field>
          <Field label="板型分類">
            <select value={templateType} onChange={e => setTemplateType(e.target.value as TemplateType | '')} className={SELECT_CLS}>
              <option value="">— 不分類 —</option>
              {TEMPLATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="說明（選填）">
            <input value={description} onChange={e => setDescription(e.target.value)} className={INPUT_CLS} placeholder="模板說明..." />
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

// ── Model Number Parser ──────────────────────────────────────────────────────
// Format: {type:1}{category:1}{customerCode:var}{seq:3digits}{version:1letter}
// e.g. SA161A047B → S/A/161A/047/B

interface ModelNumberParts {
  type: string       // S=樣品, Y=量產
  typeLabel: string
  category: string   // 產品種類碼
  customer: string   // 客戶代號
  seq: string        // 產品序號
  version: string    // 製程版本
  versionNum: number // A=1, B=2, ...
}

const TYPE_MAP: Record<string, string> = { S: '樣品', Y: '量產' }

function parseModelNumber(mn: string): ModelNumberParts | null {
  const m = /^([SY])([A-Z])(.+?)(\d{3})([A-Z])$/i.exec(mn.trim())
  if (!m) return null
  const [, type, category, customer, seq, version] = m as unknown as [string, string, string, string, string, string]
  return {
    type: type.toUpperCase(),
    typeLabel: TYPE_MAP[type.toUpperCase()] ?? type,
    category: category.toUpperCase(),
    customer: customer.toUpperCase(),
    seq,
    version: version.toUpperCase(),
    versionNum: version.toUpperCase().charCodeAt(0) - 64,
  }
}

function ModelNumberHint({ modelNumber }: { modelNumber: string }) {
  const parts = parseModelNumber(modelNumber)
  if (!parts) return null
  return (
    <span className="inline-flex gap-1 ml-2 text-[10px] text-slate-400 font-normal">
      <span className={parts.type === 'S' ? 'text-amber-500' : 'text-emerald-500'}>{parts.typeLabel}</span>
      <span>·</span>
      <span>類{parts.category}</span>
      <span>·</span>
      <span>客{parts.customer}</span>
      <span>·</span>
      <span>#{parts.seq}</span>
      <span>·</span>
      <span>v{parts.versionNum}</span>
    </span>
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
