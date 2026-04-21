import { useState, useEffect, useCallback } from 'react'
import {
  routesApi, stationsApi, productsApi,
  ProcessRoute, ProcessStep, Station,
} from '../api/admin'

export function StepsModal({ routeId, routeName, isTemplate: _isTemplate, deptId, templates, productId, onClose }: {
  routeId: string; routeName: string; isTemplate: boolean
  deptId: string; templates: ProcessRoute[]; productId?: string; onClose: () => void
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

  const renumberVisible = (allSteps: ProcessStep[], deleted: Set<string>) => {
    const visible = allSteps.filter(s => !deleted.has(s.id))
    const orderMap = new Map<string, number>()
    visible.forEach((s, i) => orderMap.set(s.id, i + 1))
    return allSteps.map(s => {
      const newOrder = orderMap.get(s.id)
      return newOrder != null ? { ...s, stepOrder: newOrder } : s
    }).sort((a, b) => a.stepOrder - b.stepOrder)
  }

  const handleDelete = (stepId: string) => {
    const nextDeleted = new Set(deletedIds).add(stepId)
    setDeletedIds(nextDeleted)
    setSteps(prev => renumberVisible(prev, nextDeleted))
  }

  const handleRestore = (stepId: string) => {
    const nextDeleted = new Set(deletedIds)
    nextDeleted.delete(stepId)
    setDeletedIds(nextDeleted)
    setSteps(prev => renumberVisible(prev, nextDeleted))
  }

  const handleMove = (_step: ProcessStep, index: number, dir: 1 | -1) => {
    const visibleSteps = steps.filter(s => !deletedIds.has(s.id))
    // swap positions in visible array
    const reordered = [...visibleSteps]
    const targetIdx = index + dir
    ;[reordered[index], reordered[targetIdx]] = [reordered[targetIdx]!, reordered[index]!]
    // reassign sequential stepOrder to all visible steps
    const orderMap = new Map<string, number>()
    reordered.forEach((s, i) => orderMap.set(s.id, i + 1))
    // also keep deleted steps with their original order (won't matter, they're deleted)
    setSteps(prev => prev.map(s => {
      const newOrder = orderMap.get(s.id)
      return newOrder != null ? { ...s, stepOrder: newOrder } : s
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
    const visibleSteps = steps.filter(s => !deletedIds.has(s.id))
    if (visibleSteps.length === 0) {
      setError('製程至少需要一個步驟')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Check affected work orders before saving
      if (isDirty && productId) {
        const { items: affected } = await productsApi.affectedOrders(productId)
        if (affected.length > 0) {
          const orderList = affected.map(o => o.orderNumber).join('、')
          const ok = confirm(
            `此製程變更將影響 ${affected.length} 張進行中的工單：\n\n${orderList}\n\n這些工單的站點歷程將被備份至備註並清除。確定繼續？`
          )
          if (!ok) { setSaving(false); return }
          await productsApi.resetAffectedOrders(productId)
        }
      }

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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
        {/* 1. Title */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">製程步驟 — {routeName.replace('【模板】', '')}</h2>
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
