import { useEffect, useRef, useState, useCallback } from 'react'
import { dashboardApi, departmentsApi, type WipStation, type TodayStats, type WorkOrderProgress, type Department, type StationWorkOrder, type DashboardAlerts, type DwellAlertItem, type DeliveryAlertItem } from '../api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function wipBg(count: number): string {
  if (count === 0) return 'bg-slate-700/60 border-slate-600/50 text-slate-500'
  if (count <= 3) return 'bg-emerald-700 border-emerald-500 text-white'
  if (count <= 7) return 'bg-amber-600 border-amber-500 text-white'
  return 'bg-red-700 border-red-500 text-white animate-pulse'
}

function statusBadge(s: string): string {
  const map: Record<string, string> = {
    pending: 'bg-slate-600 text-slate-200',
    in_progress: 'bg-blue-600 text-white',
    completed: 'bg-emerald-600 text-white',
    cancelled: 'bg-slate-700 text-slate-400',
    split: 'bg-purple-700 text-white',
  }
  return map[s] ?? 'bg-slate-600 text-slate-200'
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: '待生產', in_progress: '生產中', completed: '已完工',
    cancelled: '已取消', split: '已拆單',
  }
  return map[s] ?? s
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
  })
}

type GroupedWip = {
  groupId: string | null
  groupName: string | null
  groupStage: string | null
  groupSortOrder: number
  stations: WipStation[]
  totalWip: number
  totalQueuing: number
}

type DeptSection = {
  departmentId: string
  departmentName: string
  groups: GroupedWip[]
  totalWip: number
}

function groupStations(stations: WipStation[]): GroupedWip[] {
  const map = new Map<string, GroupedWip>()
  for (const s of stations) {
    const key = s.groupId ?? '__none__'
    if (!map.has(key)) {
      map.set(key, { groupId: s.groupId, groupName: s.groupName, groupStage: s.groupStage, groupSortOrder: s.groupSortOrder, stations: [], totalWip: 0, totalQueuing: 0 })
    }
    const g = map.get(key)!
    g.stations.push(s)
    g.totalWip += s.wipCount
    g.totalQueuing += s.queuingCount
  }
  return [...map.values()].sort((a, b) => a.groupSortOrder - b.groupSortOrder)
}

function groupByDept(stations: WipStation[], depts: Department[]): DeptSection[] {
  const map = new Map<string, DeptSection>()
  for (const s of stations) {
    if (!map.has(s.departmentId)) {
      const dept = depts.find(d => d.id === s.departmentId)
      map.set(s.departmentId, { departmentId: s.departmentId, departmentName: dept?.name ?? s.departmentId, groups: [], totalWip: 0 })
    }
  }
  for (const [deptId, section] of map) {
    const deptStations = stations.filter(s => s.departmentId === deptId)
    section.groups = groupStations(deptStations)
    section.totalWip = deptStations.reduce((s, st) => s + st.wipCount, 0)
  }
  return [...map.values()]
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-slate-800/80 border border-slate-700 px-4 py-3 min-w-[100px]">
      <span className={`text-2xl font-black leading-none ${color}`}>{value}</span>
      <span className="text-xs text-slate-400 mt-1">{label}</span>
    </div>
  )
}

function WipCard({ station, isExpanded, onToggle }: { station: WipStation; isExpanded: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative flex flex-col items-center rounded-xl border px-3 py-2 min-w-[76px] gap-0.5 transition-all cursor-pointer ${wipBg(station.wipCount)} ${isExpanded ? 'ring-2 ring-blue-400 scale-105' : 'hover:scale-105'}`}
    >
      {station.queuingCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-orange-500 text-white text-[10px] font-bold rounded-full px-1 border-2 border-slate-900 animate-pulse">
          {station.queuingCount}
        </span>
      )}
      <span className="text-xl font-black leading-none">{station.wipCount}</span>
      <span className="text-[11px] font-medium text-center leading-tight max-w-[68px] break-words">{station.stationName}</span>
    </button>
  )
}

function StationDetail({ station, onClose }: { station: WipStation; onClose: () => void }) {
  const [inStation, setInStation] = useState<StationWorkOrder[]>([])
  const [queuing, setQueuing] = useState<StationWorkOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      station.wipCount > 0 ? dashboardApi.stationWorkOrders(station.stationId, 'in_station') : Promise.resolve([]),
      station.queuingCount > 0 ? dashboardApi.stationWorkOrders(station.stationId, 'queuing') : Promise.resolve([]),
    ])
      .then(([ins, q]) => { setInStation(ins); setQueuing(q) })
      .catch(() => { setInStation([]); setQueuing([]) })
      .finally(() => setLoading(false))
  }, [station.stationId, station.wipCount, station.queuingCount])

  const renderList = (items: StationWorkOrder[], label: string) => (
    items.length > 0 && (
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {items.map(wo => (
            <div
              key={wo.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors cursor-pointer text-xs"
              onClick={() => window.open(`/trace?wo=${encodeURIComponent(wo.orderNumber)}`, '_blank')}
            >
              {wo.priority === 'urgent' && (
                <span className="shrink-0 font-bold bg-red-600 text-white px-1 py-0.5 rounded text-[10px]">急</span>
              )}
              <span className="font-semibold text-slate-100">{wo.orderNumber}</span>
              <span className="text-slate-400 truncate">{wo.productName}</span>
              <span className="ml-auto text-slate-500 shrink-0">×{wo.plannedQty}</span>
            </div>
          ))}
        </div>
      </div>
    )
  )

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-xl p-3 mt-2 animate-in">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-slate-100">{station.stationName}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm px-1.5 cursor-pointer">✕</button>
      </div>
      {loading ? (
        <div className="text-center text-slate-500 text-xs py-3">載入中...</div>
      ) : inStation.length === 0 && queuing.length === 0 ? (
        <div className="text-center text-slate-500 text-xs py-3">目前無工單</div>
      ) : (
        <div className="space-y-2">
          {renderList(inStation, `站內 (${inStation.length})`)}
          {renderList(queuing, `待入站 (${queuing.length})`)}
        </div>
      )}
    </div>
  )
}

function WipGroupSection({ group, showEmpty, expandedStation, onStationToggle }: {
  group: GroupedWip
  showEmpty: boolean
  expandedStation: string | null
  onStationToggle: (stationId: string) => void
}) {
  const hasActivity = group.totalWip > 0 || group.totalQueuing > 0
  const [collapsed, setCollapsed] = useState(!hasActivity)
  const visibleStations = showEmpty ? group.stations : group.stations.filter(s => s.wipCount > 0 || s.queuingCount > 0)

  // Auto-collapse when no activity
  useEffect(() => {
    if (!hasActivity && !showEmpty) setCollapsed(true)
    else setCollapsed(false)
  }, [hasActivity, showEmpty])

  if (!showEmpty && !hasActivity) {
    return (
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/30 border border-slate-700/50 text-xs text-slate-500 hover:bg-slate-800/60 hover:text-slate-400 transition-colors cursor-pointer"
      >
        <span className="font-medium">{group.groupName ?? '未分組'}</span>
        {group.groupStage && <span className="text-slate-600">· {group.groupStage}</span>}
        <span className="ml-auto">{group.stations.length} 站</span>
      </button>
    )
  }

  return (
    <div className={`rounded-xl border ${hasActivity ? 'border-slate-600 bg-slate-800' : 'border-slate-700/50 bg-slate-800/40'}`}>
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/20 transition-colors"
      >
        <span className="text-xs font-medium text-slate-500">{collapsed ? '▸' : '▾'}</span>
        <span className="text-sm font-semibold text-slate-200">{group.groupName ?? '未分組'}</span>
        {group.groupStage && (
          <span className="text-[10px] text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded-full">{group.groupStage}</span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          {group.totalWip > 0 && <span className="font-bold text-emerald-400">{group.totalWip} 站內</span>}
          {group.totalQueuing > 0 && <span className="font-bold text-orange-400">{group.totalQueuing} 待入站</span>}
          <span>{group.stations.length} 站</span>
        </span>
      </button>
      {!collapsed && (
        <div className="p-2">
          <div className="flex flex-wrap gap-1.5">
            {(showEmpty ? group.stations : visibleStations.length > 0 ? visibleStations : group.stations).map(s => (
              <WipCard
                key={s.stationId}
                station={s}
                isExpanded={expandedStation === s.stationId}
                onToggle={() => onStationToggle(s.stationId)}
              />
            ))}
          </div>
          {expandedStation && group.stations.find(s => s.stationId === expandedStation) && (
            <StationDetail
              station={group.stations.find(s => s.stationId === expandedStation)!}
              onClose={() => onStationToggle(expandedStation)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function AlertBadge({ label, count, color, expanded, onClick }: {
  label: string; count: number; color: string; expanded: boolean; onClick: () => void
}) {
  if (count === 0) return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/30 text-xs text-slate-600">
      <span>{label}</span>
      <span className="font-bold">0</span>
    </div>
  )
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs text-white font-medium transition-all cursor-pointer ${color} ${expanded ? 'ring-2 ring-blue-400 scale-105' : 'hover:scale-105'}`}
    >
      <span>{label}</span>
      <span className="font-black text-sm">{count}</span>
    </button>
  )
}

function DwellAlertRow({ item }: { item: DwellAlertItem }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 transition-colors cursor-pointer text-xs"
      onClick={() => window.open(`/trace?wo=${encodeURIComponent(item.orderNumber)}`, '_blank')}
    >
      {item.priority === 'urgent' && <span className="shrink-0 font-bold bg-red-600 text-white px-1 py-0.5 rounded text-[10px]">急</span>}
      <span className="font-semibold text-slate-100">{item.orderNumber}</span>
      <span className="text-slate-400 truncate">{item.productName}</span>
      <span className="ml-auto flex items-center gap-2 shrink-0">
        <span className="text-slate-500">{item.stationName}</span>
        <span className={`font-bold ${item.daysInStation >= 7 ? 'text-red-400' : 'text-amber-400'}`}>{item.daysInStation}天</span>
      </span>
    </div>
  )
}

function DeliveryAlertRow({ item }: { item: DeliveryAlertItem }) {
  const isOverdue = item.dueDate && item.dueDate < new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 transition-colors cursor-pointer text-xs"
      onClick={() => window.open(`/trace?wo=${encodeURIComponent(item.orderNumber)}`, '_blank')}
    >
      {item.priority === 'urgent' && <span className="shrink-0 font-bold bg-red-600 text-white px-1 py-0.5 rounded text-[10px]">急</span>}
      <span className="font-semibold text-slate-100">{item.orderNumber}</span>
      <span className="text-slate-400 truncate">{item.productName}</span>
      <span className="ml-auto flex items-center gap-2 shrink-0">
        <span className="text-slate-500">×{item.plannedQty}</span>
        {item.dueDate && (
          <span className={`font-medium ${isOverdue ? 'text-red-400' : 'text-amber-400'}`}>
            {formatDateShort(item.dueDate)}
          </span>
        )}
      </span>
    </div>
  )
}

function AlertPanel({ alerts, expandedAlert, onToggle }: {
  alerts: DashboardAlerts; expandedAlert: string | null; onToggle: (key: string) => void
}) {
  const alertConfigs = [
    { key: 'dwell7d', label: '滯站 7天+', count: alerts.dwell7dCount, color: 'bg-red-700 border-red-500' },
    { key: 'dwell2d', label: '滯站 2天+', count: alerts.dwell2dCount, color: 'bg-amber-700 border-amber-500' },
    { key: 'overdue', label: '已逾期', count: alerts.overdueCount, color: 'bg-red-700 border-red-500' },
    { key: 'dueSoon', label: '2週內交期', count: alerts.dueSoonCount, color: 'bg-amber-600 border-amber-400' },
    { key: 'readyToShip', label: '待出貨', count: alerts.readyToShipCount, color: 'bg-emerald-700 border-emerald-500' },
  ]

  const itemsMap: Record<string, DwellAlertItem[] | DeliveryAlertItem[]> = {
    dwell7d: alerts.dwell7dItems,
    dwell2d: alerts.dwell2dItems,
    overdue: alerts.overdueItems,
    dueSoon: alerts.dueSoonItems,
    readyToShip: alerts.readyToShipItems,
  }

  const isDwellKey = (key: string) => key === 'dwell2d' || key === 'dwell7d'

  return (
    <div className="shrink-0 border-b border-slate-800 bg-slate-900/40">
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
        <span className="text-[10px] text-slate-600 uppercase tracking-wide shrink-0">警示</span>
        {alertConfigs.map(a => (
          <AlertBadge
            key={a.key} label={a.label} count={a.count} color={a.color}
            expanded={expandedAlert === a.key} onClick={() => onToggle(a.key)}
          />
        ))}
      </div>
      {expandedAlert && itemsMap[expandedAlert] && itemsMap[expandedAlert]!.length > 0 && (
        <div className="px-4 pb-2">
          <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 max-h-48 overflow-y-auto">
            {isDwellKey(expandedAlert)
              ? (itemsMap[expandedAlert] as DwellAlertItem[]).map(item => <DwellAlertRow key={`${item.workOrderId}-${item.stationName}`} item={item} />)
              : (itemsMap[expandedAlert] as DeliveryAlertItem[]).map(item => <DeliveryAlertRow key={item.workOrderId} item={item} />)
            }
          </div>
        </div>
      )}
    </div>
  )
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400">{completed}/{total}</span>
    </div>
  )
}

function WoRow({ wo }: { wo: WorkOrderProgress }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 transition-colors cursor-pointer"
      onClick={() => window.open(`/trace?wo=${encodeURIComponent(wo.orderNumber)}`, '_blank')}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {wo.priority === 'urgent' && (
            <span className="shrink-0 text-[10px] font-bold bg-red-600 text-white px-1 py-0.5 rounded">急</span>
          )}
          <span className="text-xs font-semibold text-slate-100 truncate">{wo.orderNumber}</span>
          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${statusBadge(wo.status)}`}>
            {statusLabel(wo.status)}
          </span>
          {wo.status === 'in_progress' && wo.currentStationName && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300">
              {wo.currentStationName}
            </span>
          )}
          {wo.status === 'in_progress' && !wo.currentStationName && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-500">
              待入站
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-400 truncate block">{wo.productName}</span>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <ProgressBar completed={wo.completedSteps} total={wo.totalSteps} />
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          {wo.lastActivityAt
            ? <span>{wo.lastActivityType === 'in' ? '入站' : '出站'} {formatDateShort(wo.lastActivityAt)} {formatTime(wo.lastActivityAt).slice(0, 5)}</span>
            : <span>待開始</span>}
          {wo.dueDate && <span className={wo.dueDate < new Date().toISOString().slice(0, 10) ? 'text-red-400 font-semibold' : ''}>交期 {formatDateShort(wo.dueDate)}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

const POLL_MS = 30_000

export function DashboardPage() {
  const [depts, setDepts] = useState<Department[]>([])
  const [activeDeptId, setActiveDeptId] = useState<string | undefined>()
  const [showEmpty, setShowEmpty] = useState(false)
  const [expandedStation, setExpandedStation] = useState<string | null>(null)

  const [wipData, setWipData] = useState<WipStation[]>([])
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null)
  const [progress, setProgress] = useState<WorkOrderProgress[]>([])
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null)
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [wip, today, prog, alertData] = await Promise.all([
        dashboardApi.wip({ departmentId: activeDeptId }),
        dashboardApi.today(activeDeptId),
        dashboardApi.workOrderProgress({ departmentId: activeDeptId }),
        dashboardApi.alerts(activeDeptId),
      ])
      setWipData(wip)
      setTodayStats(today)
      setProgress(prog)
      setAlerts(alertData)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [activeDeptId])

  useEffect(() => {
    departmentsApi.list().then(setDepts).catch(() => {/* ignore */})
  }, [])

  useEffect(() => {
    setLoading(true)
    void fetchAll()
  }, [fetchAll])

  useEffect(() => {
    timerRef.current = setInterval(() => { void fetchAll() }, POLL_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchAll])

  const filteredWip = activeDeptId ? wipData.filter(s => s.departmentId === activeDeptId) : wipData
  const groupedWip = activeDeptId ? groupStations(filteredWip) : null
  const deptSections = !activeDeptId ? groupByDept(filteredWip, depts) : null
  const totalWip = filteredWip.reduce((s, st) => s + st.wipCount, 0)
  const totalQueuing = filteredWip.reduce((s, st) => s + st.queuingCount, 0)
  const stationsWithActivity = filteredWip.filter(s => s.wipCount > 0 || s.queuingCount > 0).length
  const totalStations = filteredWip.length

  const handleStationToggle = (stationId: string) => {
    setExpandedStation(prev => prev === stationId ? null : stationId)
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* ── Top controls ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0 flex-wrap">
        {/* Department tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setActiveDeptId(undefined)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${!activeDeptId ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            全廠
          </button>
          {depts.map(d => (
            <button
              key={d.id}
              onClick={() => setActiveDeptId(d.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${activeDeptId === d.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
            >
              {d.name}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {/* Show empty toggle */}
        <button
          onClick={() => setShowEmpty(v => !v)}
          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${showEmpty ? 'border-blue-500 text-blue-400 bg-blue-500/10' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}
        >
          {showEmpty ? '隱藏空站' : '顯示空站'}
        </button>
        {/* Refresh */}
        <div className="flex items-center gap-1.5">
          {lastUpdated && <span className="text-xs text-slate-500">{formatTime(lastUpdated.toISOString())}</span>}
          <button
            onClick={() => { void fetchAll() }}
            className="text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-2 py-1 rounded transition-colors cursor-pointer"
          >
            ↺
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      {todayStats && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900/60 border-b border-slate-800 shrink-0">
          <StatCard value={todayStats.totals.completedOrders} label="今日完工" color="text-emerald-400" />
          <StatCard value={todayStats.totals.totalCheckOuts} label="今日出站" color="text-blue-400" />
          <StatCard value={todayStats.totals.activeOrders} label="生產中工單" color="text-amber-400" />
          <div className="flex-1" />
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">站內</span>
                <span className={`text-2xl font-black ${totalWip > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>{totalWip}</span>
              </div>
              {totalQueuing > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">待入站</span>
                  <span className="text-2xl font-black text-orange-400">{totalQueuing}</span>
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-600">{stationsWithActivity}/{totalStations} 站有工單</span>
          </div>
        </div>
      )}

      {/* ── Alert bar ── */}
      {alerts && (
        <AlertPanel
          alerts={alerts}
          expandedAlert={expandedAlert}
          onToggle={(key) => setExpandedAlert(prev => prev === key ? null : key)}
        />
      )}

      {/* ── Content: two-column layout ── */}
      <div className="flex-1 overflow-hidden flex">
        {loading && wipData.length === 0 ? (
          <div className="flex-1 flex justify-center items-center text-slate-400">載入中...</div>
        ) : error ? (
          <div className="flex-1 flex justify-center items-center text-red-400">{error}</div>
        ) : (
          <>
            {/* Left column: WIP stations */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-w-0">
              {groupedWip && groupedWip.map(g => (
                <WipGroupSection
                  key={g.groupId ?? '__none__'}
                  group={g}
                  showEmpty={showEmpty}
                  expandedStation={expandedStation}
                  onStationToggle={handleStationToggle}
                />
              ))}
              {deptSections && deptSections.map(section => (
                <div key={section.departmentId}>
                  <div className="flex items-center gap-2 mb-1.5 mt-1">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{section.departmentName}</span>
                    {section.totalWip > 0 && (
                      <span className="text-xs font-bold text-emerald-400">{section.totalWip} 張</span>
                    )}
                    <div className="flex-1 h-px bg-slate-700" />
                  </div>
                  <div className="space-y-2">
                    {section.groups.map(g => (
                      <WipGroupSection
                        key={`${section.departmentId}-${g.groupId ?? '__none__'}`}
                        group={g}
                        showEmpty={showEmpty}
                        expandedStation={expandedStation}
                        onStationToggle={handleStationToggle}
                            />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Right column: Work order progress */}
            <div className="w-[380px] shrink-0 border-l border-slate-800 flex flex-col overflow-hidden bg-slate-900/30 hidden lg:flex">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  工單進度
                </h2>
                <span className="text-xs text-slate-500">{progress.length} 張</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {progress.length > 0 ? (
                  progress.map(wo => <WoRow key={wo.id} wo={wo} />)
                ) : (
                  <div className="text-center py-8 text-slate-500 text-sm">目前無進行中工單</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mobile: work order progress below (visible on small screens) */}
      {!loading && !error && progress.length > 0 && (
        <div className="lg:hidden border-t border-slate-800 max-h-[200px] overflow-y-auto bg-slate-900/30">
          <div className="px-3 py-1.5 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">工單進度 ({progress.length})</span>
          </div>
          {progress.slice(0, 10).map(wo => <WoRow key={wo.id} wo={wo} />)}
        </div>
      )}
    </div>
  )
}
