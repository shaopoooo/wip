import { useEffect, useReducer, useRef, useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { scanApi, type ScanPreview, type ScanResult, type StepContext } from '../api'
import { getStoredDeviceId } from '../hooks/useDevice'
import { Modal } from '../components/Modal'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
  const parts = new Intl.DateTimeFormat('zh-TW', opts).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`
}

const STATUS_LABEL: Record<StepContext['status'], string> = {
  pending: '待入站',
  in_progress: '作業中',
  completed: '已完成',
  auto_filled: '自動補填',
  abnormal: '異常',
}

const STATUS_BADGE: Record<StepContext['status'], string> = {
  pending: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-500 text-white',
  completed: 'bg-emerald-500 text-white',
  auto_filled: 'bg-amber-400 text-amber-900',
  abnormal: 'bg-red-500 text-white',
}

// ── StepsContextPanel ─────────────────────────────────────────────────────────

const STEP_ROW: Record<StepContext['status'], string> = {
  pending: 'bg-white',
  in_progress: 'bg-blue-50',
  completed: 'bg-white',
  auto_filled: 'bg-white',
  abnormal: 'bg-red-50',
}

const STEP_NUM: Record<StepContext['status'], string> = {
  pending: 'bg-slate-200 text-slate-500',
  in_progress: 'bg-blue-600 text-white',
  completed: 'bg-emerald-500 text-white',
  auto_filled: 'bg-amber-400 text-amber-900',
  abnormal: 'bg-red-500 text-white',
}

function StepsContextPanel({ steps, currentStepOrder }: { steps: StepContext[]; currentStepOrder: number }) {
  const [expanded, setExpanded] = useState(false)

  const visible = expanded
    ? steps
    : steps.filter(s => s.stepOrder >= currentStepOrder - 1 && s.stepOrder <= currentStepOrder + 1)

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200">
      {visible.map((s, i) => {
        const isCurrent = s.stepOrder === currentStepOrder
        return (
          <div
            key={s.stepOrder}
            className={[
              'flex items-center gap-3 px-4 py-3',
              i < visible.length - 1 ? 'border-b border-slate-200' : '',
              STEP_ROW[s.status],
              isCurrent ? 'border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent',
            ].join(' ')}
          >
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${STEP_NUM[s.status]}`}>
              {s.stepOrder}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`font-semibold truncate ${isCurrent ? 'text-base text-slate-900' : 'text-sm text-slate-600'}`}>
                {s.stationName}{s.stationCode ? ` · ${s.stationCode}` : ''}
              </p>
              {(s.checkInTime || s.checkOutTime) && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {s.checkInTime && formatTime(s.checkInTime)}
                  {s.checkInTime && s.checkOutTime && ' ~ '}
                  {s.checkOutTime && formatTime(s.checkOutTime)}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[s.status]}`}>
                {STATUS_LABEL[s.status]}
              </span>
            </div>
          </div>
        )
      })}
      {steps.length > 3 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 border-t border-slate-200 transition-colors cursor-pointer"
        >
          {expanded ? '收合 ↑' : `展開全部 ${steps.length} 站 ↓`}
        </button>
      )}
    </div>
  )
}

// ── WorkOrderCard ─────────────────────────────────────────────────────────────

function WorkOrderCard({ preview, action }: { preview: ScanPreview; action: 'check_in' | 'check_out' }) {
  const qtyIn = preview.openLog?.actualQtyIn ?? preview.workOrder.plannedQty
  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono font-bold text-xl text-slate-800 tracking-wider">
          {preview.workOrder.orderNumber}
        </p>
        <p className="text-slate-500 text-sm mt-0.5">{preview.product.name}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <span className="text-slate-400 text-xs">物料編號</span>
          <p className="text-slate-800 font-semibold">{preview.product.modelNumber}</p>
        </div>
        <div>
          <span className="text-slate-400 text-xs">{action === 'check_in' ? '入站站點' : '出站站點'}</span>
          <p className="text-slate-800 font-semibold">{preview.station.name}</p>
        </div>
        <div>
          <span className="text-slate-400 text-xs">訂單數量</span>
          <p className="text-slate-800 font-semibold">{preview.workOrder.plannedQty}</p>
        </div>
        <div>
          <span className="text-slate-400 text-xs">製作數量</span>
          <p className="text-slate-800 font-semibold">{qtyIn}</p>
        </div>
      </div>
      {preview.station.description && (
        <div className="border-t border-slate-100 pt-2">
          <span className="text-slate-400 text-xs">作業重點指示</span>
          <p className="text-slate-700 text-sm mt-0.5 whitespace-pre-line">{preview.station.description}</p>
        </div>
      )}
    </div>
  )
}

// ── State machine ──────────────────────────────────────────────────────────────

type ScanState =
  | { status: 'idle' }
  | { status: 'previewing' }
  | { status: 'checkin_form'; preview: ScanPreview }
  | { status: 'checkout_form'; preview: ScanPreview; defectQty: number }
  | { status: 'submitting' }
  | { status: 'checkin_done'; result: ScanResult; preview: ScanPreview }
  | { status: 'checkout_done'; result: ScanResult; preview: ScanPreview }
  | { status: 'error'; code: string; message: string }

type Action =
  | { type: 'SCAN_QR'; workOrderId: string }
  | { type: 'PREVIEW_OK_CHECKIN'; preview: ScanPreview }
  | { type: 'PREVIEW_OK_CHECKOUT'; preview: ScanPreview }
  | { type: 'SET_DEFECT_QTY'; qty: number }
  | { type: 'SUBMIT_CHECKIN' }
  | { type: 'SUBMIT_CHECKOUT' }
  | { type: 'CHECKIN_DONE'; result: ScanResult; preview: ScanPreview }
  | { type: 'CHECKOUT_DONE'; result: ScanResult; preview: ScanPreview }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'RESET' }

function reducer(state: ScanState, action: Action): ScanState {
  switch (action.type) {
    case 'SCAN_QR': return { status: 'previewing' }
    case 'PREVIEW_OK_CHECKIN': return { status: 'checkin_form', preview: action.preview }
    case 'PREVIEW_OK_CHECKOUT': return { status: 'checkout_form', preview: action.preview, defectQty: 0 }
    case 'SET_DEFECT_QTY': return state.status === 'checkout_form' ? { ...state, defectQty: action.qty } : state
    case 'SUBMIT_CHECKIN':
    case 'SUBMIT_CHECKOUT': return { status: 'submitting' }
    case 'CHECKIN_DONE': return { status: 'checkin_done', result: action.result, preview: action.preview }
    case 'CHECKOUT_DONE': return { status: 'checkout_done', result: action.result, preview: action.preview }
    case 'ERROR': {
      new Audio('/error.wav').play().catch(() => { })
      return { status: 'error', code: action.code, message: action.message }
    }
    case 'RESET': return { status: 'idle' }
    default: return state
  }
}

// ── ScanPage ──────────────────────────────────────────────────────────────────

export function ScanPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const deviceId = getStoredDeviceId()
  const [state, dispatch] = useReducer(reducer, { status: 'idle' })
  const lastScannedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!deviceId) navigate('/setup', { replace: true })
  }, [deviceId, navigate])

  const handleQr = useCallback((workOrderId: string) => {
    if (state.status !== 'idle') return
    if (lastScannedRef.current === workOrderId) return
    lastScannedRef.current = workOrderId
    dispatch({ type: 'SCAN_QR', workOrderId })

    scanApi.preview(workOrderId, deviceId!)
      .then((preview) => {
        dispatch({ type: preview.action === 'check_in' ? 'PREVIEW_OK_CHECKIN' : 'PREVIEW_OK_CHECKOUT', preview })
      })
      .catch((err: Error) => {
        dispatch({ type: 'ERROR', code: (err as { code?: string }).code ?? 'INTERNAL_ERROR', message: err.message })
      })
  }, [state.status, deviceId])

  const submitCheckin = useCallback(() => {
    if (state.status !== 'checkin_form') return
    const { preview } = state
    dispatch({ type: 'SUBMIT_CHECKIN' })
    scanApi.scan({ orderNumber: preview.workOrder.orderNumber }, deviceId!)
      .then((result) => dispatch({ type: 'CHECKIN_DONE', result, preview }))
      .catch((err: Error) => {
        dispatch({ type: 'ERROR', code: (err as { code?: string }).code ?? 'INTERNAL_ERROR', message: err.message })
      })
  }, [state, deviceId])

  const submitCheckout = useCallback(() => {
    if (state.status !== 'checkout_form') return
    const { preview, defectQty } = state
    dispatch({ type: 'SUBMIT_CHECKOUT' })
    scanApi.scan({ orderNumber: preview.workOrder.orderNumber, defectQty }, deviceId!)
      .then((result) => dispatch({ type: 'CHECKOUT_DONE', result, preview }))
      .catch((err: Error) => {
        dispatch({ type: 'ERROR', code: (err as { code?: string }).code ?? 'INTERNAL_ERROR', message: err.message })
      })
  }, [state, deviceId])

  const handleReset = useCallback(() => {
    lastScannedRef.current = null
    setSearchParams(new URLSearchParams(), { replace: true })
    dispatch({ type: 'RESET' })
  }, [setSearchParams])

  useEffect(() => {
    if (state.status === 'checkin_done') {
      const t = setTimeout(() => {
        lastScannedRef.current = null
        setSearchParams(new URLSearchParams(), { replace: true })
        dispatch({ type: 'RESET' })
      }, 2000)
      return () => clearTimeout(t)
    }
  }, [state.status, setSearchParams])

  useEffect(() => {
    const wo = searchParams.get('wo')
    if (wo && deviceId && state.status === 'idle') handleQr(wo)
  }, [searchParams, deviceId, state.status, handleQr])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Idle ── */}
      {(state.status === 'idle' || state.status === 'checkin_form' || state.status === 'checkout_form') && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
          <div>
            <h2 className="text-2xl font-bold text-white">等待掃描</h2>
            <p className="text-slate-400 mt-2 text-sm">掃描 QR Code 或手動輸入工單號</p>
          </div>
          <form
            className="flex gap-2 w-full max-w-md"
            onSubmit={(e) => {
              e.preventDefault()
              const val = (e.currentTarget.elements.namedItem('orderNumber') as HTMLInputElement).value.trim()
              if (val) handleQr(val)
            }}
          >
            <input
              name="orderNumber"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="WO-FPC-2026-001"
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-base"
            />
            <button type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg font-semibold transition-colors active:scale-95 cursor-pointer">
              送出
            </button>
          </form>
        </div>
      )}

      {/* ── Loading ── */}
      {(state.status === 'previewing' || state.status === 'submitting') && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-600 border-t-white rounded-full animate-spin" />
          <p className="text-white text-lg">{state.status === 'previewing' ? '驗證中...' : '報工中...'}</p>
        </div>
      )}

      {/* ── Check-in done ── */}
      {state.status === 'checkin_done' && 'preview' in state && 'result' in state && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-emerald-600 text-white">
          <div className="text-7xl">✓</div>
          <h2 className="text-3xl font-bold">報工入站成功</h2>
          <p className="text-xl font-mono font-bold">{state.preview.workOrder.orderNumber}</p>
          <p className="text-emerald-100">{state.preview.product.name} · {state.preview.station.name}</p>
          {state.result.autoFilledCount > 0 && (
            <span className="bg-emerald-800/50 text-emerald-100 text-sm px-3 py-1 rounded-full">
              自動補填 {state.result.autoFilledCount} 個站點
            </span>
          )}
        </div>
      )}

      {/* ── Check-out done ── */}
      {state.status === 'checkout_done' && 'preview' in state && 'result' in state && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-emerald-600 text-white">
          <div className="text-7xl">✓</div>
          <h2 className="text-3xl font-bold">{state.result.workOrderCompleted ? '工單已完工！' : '報工出站成功'}</h2>
          <p className="text-xl font-mono font-bold">{state.preview.workOrder.orderNumber}</p>
          <p className="text-emerald-100">
            出站數量：<strong className="text-2xl">{state.result.log.actualQtyOut ?? state.preview.workOrder.plannedQty}</strong>
          </p>
          <button onClick={handleReset}
            className="mt-4 bg-white/20 hover:bg-white/30 text-white px-8 py-3 rounded-xl font-semibold transition-colors cursor-pointer">
            繼續掃描
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {state.status === 'error' && 'message' in state && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-red-700 text-white px-8 text-center">
          <div className="text-7xl">✕</div>
          <h2 className="text-3xl font-bold">掃描失敗</h2>
          <p className="text-red-100 text-lg max-w-sm">{state.message}</p>
          <button onClick={handleReset}
            className="mt-4 bg-white/20 hover:bg-white/30 text-white px-8 py-3 rounded-xl font-semibold transition-colors cursor-pointer">
            重新掃描
          </button>
        </div>
      )}

      {/* ── 入站確認 Modal（藍色）── */}
      <Modal open={state.status === 'checkin_form'} onClose={handleReset} size="lg">
        {state.status === 'checkin_form' && 'preview' in state && (
          <div className="space-y-4">
            <div className="bg-blue-600 rounded-xl px-4 py-3">
              <p className="text-blue-100 text-xs font-semibold uppercase tracking-widest">入站確認</p>
              <p className="text-white font-bold text-xl">Check In</p>
            </div>
            <WorkOrderCard preview={state.preview} action="check_in" />
            <div>
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">製程進度</p>
              <StepsContextPanel steps={state.preview.stepsContext} currentStepOrder={state.preview.step.stepOrder} />
            </div>
            <button
              onClick={submitCheckin}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl text-lg font-bold transition-colors active:scale-95 cursor-pointer"
            >
              確認入站
            </button>
          </div>
        )}
      </Modal>

      {/* ── 出站確認 Modal（橘色）── */}
      <Modal open={state.status === 'checkout_form'} onClose={handleReset} size="lg">
        {state.status === 'checkout_form' && 'preview' in state && (
          <div className="space-y-4">
            <div className="bg-orange-500 rounded-xl px-4 py-3">
              <p className="text-orange-100 text-xs font-semibold uppercase tracking-widest">出站確認</p>
              <p className="text-white font-bold text-xl">Check Out</p>
            </div>
            <WorkOrderCard preview={state.preview} action="check_out" />
            <div>
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">製程進度</p>
              <StepsContextPanel steps={state.preview.stepsContext} currentStepOrder={state.preview.step.stepOrder} />
            </div>
            {/* 不良品輸入（Phase 2 啟用） */}
            <button
              onClick={submitCheckout}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl text-lg font-bold transition-colors active:scale-95 cursor-pointer"
            >
              確認出站
            </button>
          </div>
        )}
      </Modal>

    </div>
  )
}
