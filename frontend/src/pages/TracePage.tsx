import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { traceApi, type TraceWorkOrder, type TraceLog, type FamilyMember } from '../api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Taipei',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }
  return d.toLocaleString('zh-TW', opts)
}

function formatDuration(inIso: string, outIso: string | null): string {
  if (!outIso) return '進行中'
  const ms = new Date(outIso).getTime() - new Date(inIso).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} 分`
  return `${Math.floor(mins / 60)} 時 ${mins % 60} 分`
}

function statusColor(s: string): string {
  const map: Record<string, string> = {
    in_progress: 'bg-blue-500',
    completed: 'bg-emerald-500',
    auto_filled: 'bg-amber-400',
    abnormal: 'bg-red-500',
  }
  return map[s] ?? 'bg-slate-400'
}

function woStatusBadge(s: string): string {
  const map: Record<string, string> = {
    pending: 'bg-slate-600 text-slate-200',
    in_progress: 'bg-blue-600 text-white',
    completed: 'bg-emerald-600 text-white',
    cancelled: 'bg-slate-700 text-slate-400',
    split: 'bg-purple-700 text-white',
  }
  return map[s] ?? 'bg-slate-600 text-slate-200'
}

function woStatusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: '待生產', in_progress: '生產中', completed: '已完工',
    cancelled: '已取消', split: '已拆單',
  }
  return map[s] ?? s
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function TimelineItem({ log, isLast }: { log: TraceLog; isLast: boolean }) {
  const isAutoFill = log.status === 'auto_filled'
  return (
    <div className="flex gap-3">
      {/* Connector */}
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${statusColor(log.status)}`} />
        {!isLast && <div className="w-0.5 flex-1 bg-slate-700 my-1" />}
      </div>
      {/* Content */}
      <div className={`flex-1 pb-4 ${isAutoFill ? 'opacity-60' : ''}`}>
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <div>
            <span className="text-sm font-semibold text-slate-100">
              {log.stepOrder}. {log.stationName}
              {log.stationCode && <span className="text-slate-400 font-normal ml-1">· {log.stationCode}</span>}
            </span>
            {log.groupName && (
              <span className="ml-2 text-xs text-slate-500">({log.groupName})</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAutoFill && (
              <span className="text-[10px] bg-amber-900/60 text-amber-300 border border-amber-700 px-1.5 py-0.5 rounded">自動補填</span>
            )}
            {log.status === 'abnormal' && (
              <span className="text-[10px] bg-red-900/60 text-red-300 border border-red-700 px-1.5 py-0.5 rounded">異常</span>
            )}
          </div>
        </div>
        <div className="text-xs text-slate-400 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">入站</span>
            <span>{formatDateTime(log.checkInTime)}</span>
            {log.checkOutTime && (
              <>
                <span className="text-slate-600">→</span>
                <span className="text-slate-500">出站</span>
                <span>{formatDateTime(log.checkOutTime)}</span>
                <span className="text-slate-500 ml-1">({formatDuration(log.checkInTime, log.checkOutTime)})</span>
              </>
            )}
            {!log.checkOutTime && log.status === 'in_progress' && (
              <span className="text-blue-400 ml-1">● 進行中</span>
            )}
          </div>
          {(log.actualQtyIn != null || log.defectQty != null) && (
            <div className="flex items-center gap-3">
              {log.actualQtyIn != null && <span>投入 {log.actualQtyIn}</span>}
              {log.actualQtyOut != null && <span>產出 {log.actualQtyOut}</span>}
              {(log.defectQty ?? 0) > 0 && (
                <span className="text-red-400">不良 {log.defectQty}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Family Tree ───────────────────────────────────────────────────────────────

function FamilyTreeNode({
  member, currentId, onSelect,
}: {
  member: FamilyMember
  currentId: string
  onSelect: (id: string) => void
}) {
  const isCurrent = member.id === currentId
  return (
    <div style={{ paddingLeft: `${member.depth * 20}px` }}>
      <button
        onClick={() => onSelect(member.id)}
        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg mb-1 transition-colors cursor-pointer ${
          isCurrent
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
            : 'hover:bg-slate-700/50 border border-transparent text-slate-300'
        }`}
      >
        <span className="text-xs">{member.depth > 0 ? '↳' : '📦'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{member.orderNumber}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${woStatusBadge(member.status)}`}>
              {woStatusLabel(member.status)}
            </span>
            {isCurrent && <span className="text-xs text-blue-400">← 目前</span>}
          </div>
          <div className="text-xs text-slate-500">{member.modelNumber} × {member.plannedQty}</div>
        </div>
      </button>
    </div>
  )
}

// ── Work Order Header ─────────────────────────────────────────────────────────

function WorkOrderHeader({ wo }: { wo: TraceWorkOrder }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {wo.priority === 'urgent' && (
              <span className="text-xs font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">急</span>
            )}
            <h2 className="text-lg font-bold text-white">{wo.orderNumber}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${woStatusBadge(wo.status)}`}>
              {woStatusLabel(wo.status)}
            </span>
          </div>
          <p className="text-sm text-slate-300">{wo.productName}</p>
          <p className="text-xs text-slate-400">{wo.modelNumber}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-400">{wo.departmentName}</p>
          <p className="text-sm font-semibold text-slate-200">{wo.plannedQty} 片</p>
          {wo.dueDate && <p className="text-xs text-slate-400">交期 {wo.dueDate}</p>}
        </div>
      </div>
      {wo.isSplit && (
        <p className="text-xs text-amber-400 bg-amber-900/30 border border-amber-800 px-2 py-1 rounded">
          此工單為拆單工單
        </p>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function TracePage() {
  const [searchParams] = useSearchParams()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [workOrder, setWorkOrder] = useState<TraceWorkOrder | null>(null)
  const [logs, setLogs] = useState<TraceLog[]>([])
  const [family, setFamily] = useState<FamilyMember[]>([])
  const [activeTab, setActiveTab] = useState<'timeline' | 'family'>('timeline')

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const wo = searchParams.get('wo')
    if (wo) {
      setInput(wo)
      void search(wo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function search(idOrOrderNumber: string) {
    if (!idOrOrderNumber.trim()) return
    setLoading(true)
    setError(null)
    try {
      const [trace, fam] = await Promise.all([
        traceApi.get(idOrOrderNumber.trim()),
        traceApi.family(idOrOrderNumber.trim()),
      ])
      setWorkOrder(trace.workOrder)
      setLogs(trace.logs)
      setFamily(fam)
    } catch (e) {
      setError(e instanceof Error ? e.message : '查詢失敗')
      setWorkOrder(null)
      setLogs([])
      setFamily([])
    } finally {
      setLoading(false)
    }
  }

  function handleSelectFamily(id: string) {
    setInput(id)
    void search(id)
  }

  const hasFamilyTree = family.length > 1

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Search bar */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
        <form
          onSubmit={e => { e.preventDefault(); void search(input) }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="輸入工單號碼，例如 WO-A-2026-001"
            className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            {loading ? '查詢中...' : '查詢'}
          </button>
        </form>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {!workOrder && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
            <div className="text-4xl">🔍</div>
            <p className="text-sm">輸入工單號碼查詢完整歷程</p>
          </div>
        )}

        {workOrder && (
          <>
            <WorkOrderHeader wo={workOrder} />

            {/* Tab switcher */}
            <div className="flex gap-1 bg-slate-800 rounded-lg p-1 self-start w-fit">
              <button
                onClick={() => setActiveTab('timeline')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${activeTab === 'timeline' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                站點歷程 ({logs.length})
              </button>
              {hasFamilyTree && (
                <button
                  onClick={() => setActiveTab('family')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${activeTab === 'family' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  母子單 ({family.length})
                </button>
              )}
            </div>

            {activeTab === 'timeline' && (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                {logs.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">尚無站點紀錄</p>
                ) : (
                  logs.map((log, i) => (
                    <TimelineItem key={log.id} log={log} isLast={i === logs.length - 1} />
                  ))
                )}
              </div>
            )}

            {activeTab === 'family' && hasFamilyTree && (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-3">
                {family.map(m => (
                  <FamilyTreeNode
                    key={m.id}
                    member={m}
                    currentId={workOrder.id}
                    onSelect={handleSelectFamily}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
