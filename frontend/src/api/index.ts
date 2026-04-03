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
  departmentId: string
  deviceType: 'tablet' | 'phone' | 'scanner'
  name?: string
  timezone?: string
  userAgent?: string
  screenInfo?: Record<string, unknown>
  webglRenderer?: string
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

export const scanApi = {
  preview: (orderNumber: string, deviceId: string) =>
    api.get<ScanPreview>('/scan/preview', { params: { orderNumber }, deviceId }),
  scan: (input: { orderNumber: string; actualQtyOut?: number; defectQty?: number }, deviceId: string) =>
    api.post<ScanResult>('/scan', input, { deviceId }),
  logs: (orderNumber: string, deviceId: string) =>
    api.get<{ orderNumber: string; logs: StationLog[] }>('/scan/logs', { params: { orderNumber }, deviceId }),
  correct: (logId: string, input: { checkInTime?: string; checkOutTime?: string; reason: string }, deviceId: string) =>
    api.patch<{ id: string }>(`/scan/${logId}/correction`, input, { deviceId }),
}
