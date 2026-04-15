import { api } from './client'

// ── 型別定義 ───────────────────────────────────────────────────────────────────

export interface Department {
  id: string
  name: string
  code: string
}

export interface Station {
  id: string
  name: string
  code: string | null
  sortOrder: number
}

export interface DeviceInfo {
  device: { id: string; name: string | null; deviceType: string; stationId: string }
  station: { id: string; name: string; code: string | null }
  department: { id: string; name: string; code: string }
}

export interface StepContext {
  stepOrder: number
  stationName: string
  stationCode: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'auto_filled' | 'abnormal'
  checkInTime: string | null
  checkOutTime: string | null
}

export interface ScanPreview {
  action: 'check_in' | 'check_out'
  workOrder: { id: string; orderNumber: string; plannedQty: number; status: string }
  product: { name: string; modelNumber: string }
  station: { id: string; name: string; code: string | null; description: string | null }
  step: { stepOrder: number }
  openLog: { id: string; checkInTime: string; actualQtyIn: number | null } | null
  stepsContext: StepContext[]
}

export interface ScanResult {
  action: 'check_in' | 'check_out'
  log: { id: string; checkInTime: string; checkOutTime: string | null; status: string; actualQtyOut: number | null }
  autoFilledCount: number
  workOrderCompleted: boolean
}

export interface RegisterDeviceInput {
  registrationToken: string
  departmentId: string
  deviceType: 'tablet' | 'phone' | 'scanner'
  name?: string
  timezone?: string
  userAgent?: string
  screenInfo?: Record<string, unknown>
  webglRenderer?: string | null
  employeeId?: string
}

// ── API 呼叫封裝 ───────────────────────────────────────────────────────────────

export const departmentsApi = {
  list: () => api.get<Department[]>('/departments'),
}

export const devicesApi = {
  get: (deviceId: string) => api.get<DeviceInfo>(`/devices/${deviceId}`),
  register: (input: RegisterDeviceInput) => api.post<{ id: string }>('/devices/register', input),
  heartbeat: (deviceId: string) => api.patch<{ id: string; lastSeenAt: string }>(`/devices/${deviceId}/heartbeat`, {}),
}

export interface StationLog {
  id: string
  stationId: string
  stationName: string
  stationCode: string | null
  status: string
  checkInTime: string
  checkOutTime: string | null
  actualQtyIn: number | null
  actualQtyOut: number | null
}

// ── Dashboard 型別 ──────────────────────────────────────────────────────────────

export interface WipStation {
  stationId: string
  stationName: string
  stationCode: string | null
  stationSortOrder: number
  groupId: string | null
  groupName: string | null
  groupStage: string | null
  groupSortOrder: number
  departmentId: string
  departmentName: string
  departmentCode: string
  wipCount: number
  queuingCount: number
}

export interface TodayStats {
  departments: {
    departmentId: string
    departmentName: string
    departmentCode: string
    completedOrders: number
    totalCheckOuts: number
    activeOrders: number
  }[]
  totals: { completedOrders: number; totalCheckOuts: number; activeOrders: number }
}

export interface WorkOrderProgress {
  id: string
  orderNumber: string
  status: string
  plannedQty: number
  priority: string
  dueDate: string | null
  createdAt: string
  isSplit: boolean
  productName: string
  modelNumber: string
  departmentId: string
  departmentName: string
  completedSteps: number
  totalSteps: number
  currentStationName: string | null
  currentGroupName: string | null
  lastActivityAt: string | null
  lastActivityType: 'in' | 'out' | null
}

// ── Traceability 型別 ──────────────────────────────────────────────────────────

export interface TraceLog {
  id: string
  stationName: string
  stationCode: string | null
  groupName: string | null
  status: string
  checkInTime: string
  checkOutTime: string | null
  actualQtyIn: number | null
  actualQtyOut: number | null
  defectQty: number | null
  stepOrder: number
}

export interface TraceWorkOrder {
  id: string
  orderNumber: string
  status: string
  plannedQty: number
  priority: string
  dueDate: string | null
  parentWorkOrderId: string | null
  isSplit: boolean
  createdAt: string
  note: string | null
  productName: string
  modelNumber: string
  productDescription: string | null
  departmentId: string
  departmentName: string
  departmentCode: string
}

export interface FamilyMember {
  id: string
  orderNumber: string
  status: string
  plannedQty: number
  priority: string
  dueDate: string | null
  parentWorkOrderId: string | null
  isSplit: boolean
  createdAt: string
  depth: number
  productName: string
  modelNumber: string
}

export const scanApi = {
  preview: (orderNumber: string, deviceId: string) =>
    api.get<ScanPreview>('/scan/preview', { params: { orderNumber }, deviceId }),
  scan: (input: { orderNumber: string; actualQtyOut?: number; defectQty?: number }, deviceId: string) => {
    const idempotencyKey = crypto.randomUUID()
    return api.post<ScanResult>('/scan', { ...input, idempotencyKey }, { deviceId, retry: 2 })
  },
  logs: (orderNumber: string, deviceId: string) =>
    api.get<{ orderNumber: string; logs: StationLog[] }>('/scan/logs', { params: { orderNumber }, deviceId }),
  correct: (logId: string, input: { checkInTime?: string; checkOutTime?: string; reason: string }, deviceId: string) =>
    api.patch<{ id: string }>(`/scan/${logId}/correction`, input, { deviceId }),
}

// ── Dashboard API ──────────────────────────────────────────────────────────────

export interface StationWorkOrder {
  id: string
  orderNumber: string
  status: string
  plannedQty: number
  priority: string
  productName: string
  modelNumber: string
  checkInTime?: string
  createdAt?: string
}

export const dashboardApi = {
  wip: (params?: { departmentId?: string }) => {
    const qs = params?.departmentId ? `?department_id=${params.departmentId}` : ''
    return api.get<WipStation[]>(`/dashboard/wip${qs}`)
  },
  today: (departmentId?: string) => {
    const qs = departmentId ? `?department_id=${departmentId}` : ''
    return api.get<TodayStats>(`/dashboard/today${qs}`)
  },
  workOrderProgress: (params?: { departmentId?: string; status?: string }) => {
    const q = new URLSearchParams()
    if (params?.departmentId) q.set('department_id', params.departmentId)
    if (params?.status) q.set('status', params.status)
    const qs = q.size ? `?${q}` : ''
    return api.get<WorkOrderProgress[]>(`/dashboard/work-order-progress${qs}`)
  },
  stationWorkOrders: (stationId: string, mode: 'in_station' | 'queuing' = 'in_station') =>
    api.get<StationWorkOrder[]>(`/dashboard/station/${stationId}/work-orders?mode=${mode}`),
}

// ── Traceability API ───────────────────────────────────────────────────────────

export const traceApi = {
  get: (idOrOrderNumber: string) =>
    api.get<{ workOrder: TraceWorkOrder; logs: TraceLog[] }>(`/traceability/${encodeURIComponent(idOrOrderNumber)}`),
  family: (idOrOrderNumber: string) =>
    api.get<FamilyMember[]>(`/traceability/${encodeURIComponent(idOrOrderNumber)}/family`),
}
