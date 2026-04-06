// Admin API client — uses httpOnly cookies (same-origin via Vite proxy / Nginx)

const BASE = '/api/admin'

export class AdminApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'AdminApiError'
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
  })
  const json = (await res.json()) as { success: boolean; data?: T; error?: { code: string; message: string } }

  if (!json.success || !res.ok) {
    const code = json.error?.code ?? 'INTERNAL_ERROR'
    const msg = json.error?.message ?? '未知錯誤'
    throw new AdminApiError(code, msg, res.status)
  }
  return json.data as T
}

const get = <T>(path: string) => req<T>(path, { method: 'GET' })
const post = <T>(path: string, body?: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
const patch = <T>(path: string, body: unknown) => req<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
const del = <T>(path: string) => req<T>(path, { method: 'DELETE' })

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminUser { userId: string; username: string; role: string }

export interface Role { id: string; name: string; description: string | null; isActive: boolean; createdAt: string }

export interface AdminUserRow {
  id: string; username: string; isActive: boolean
  roleId: string | null; roleName: string | null; createdAt: string
}

export interface Department { id: string; name: string; code: string }

export interface Group {
  id: string; departmentId: string; name: string; code: string | null
  stage: string | null; description: string | null; sortOrder: number; isActive: boolean; createdAt: string
}

export interface Customer {
  id: string; code: string; name: string | null
  costFileCount: number; needsNameMapping: boolean; isActive: boolean
  createdAt: string; updatedAt: string
}

export interface Vendor {
  id: string; token: string; normalizedName: string
  sourceFlags: string | null; scheduleVendorCount: number
  shippingVendorCount: number; statusTokenCount: number
  needsManualReview: boolean; isActive: boolean
  createdAt: string; updatedAt: string
}

export interface Station {
  id: string; departmentId: string; groupId: string | null; name: string
  code: string | null; description: string | null; sortOrder: number; isActive: boolean
}

export interface Product {
  id: string; departmentId: string; name: string; modelNumber: string
  description: string | null; isActive: boolean; createdAt: string
}

export interface ProcessRoute {
  id: string; departmentId: string; name: string; description: string | null
  isActive: boolean; version: number; createdAt: string
}

export interface ProcessStep {
  id: string; routeId: string; stationId: string; stationName: string
  stationCode: string | null; stepOrder: number; standardTime: number | null; createdAt: string
}

export interface WorkOrder {
  id: string; orderNumber: string; departmentId: string; productId: string
  routeId: string; plannedQty: number; status: string; priority: string
  dueDate: string | null; createdAt: string; updatedAt: string
}

export interface WorkOrderRow {
  workOrder: WorkOrder
  product: { name: string; modelNumber: string }
  route?: { name: string }
}

export interface WorkOrderDetail extends WorkOrderRow {
  logs: {
    id: string; stationName: string; stationCode: string | null; status: string
    checkInTime: string; checkOutTime: string | null
    actualQtyIn: number | null; actualQtyOut: number | null
  }[]
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) => post<{ user: AdminUser }>('/auth/login', { username, password }),
  logout: () => post<null>('/auth/logout'),
  me: () => get<{ user: AdminUser }>('/auth/me'),
  refresh: () => post<{ user: AdminUser }>('/auth/refresh'),
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export const rolesApi = {
  list: () => get<Role[]>('/roles'),
  create: (data: { name: string; description?: string }) => post<Role>('/roles', data),
  delete: (id: string) => del<null>(`/roles/${id}`),
}

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => get<AdminUserRow[]>('/users'),
  create: (data: { username: string; password: string; roleId?: string | null }) => post<AdminUserRow>('/users', data),
  update: (id: string, data: { roleId?: string | null; isActive?: boolean; password?: string }) => patch<AdminUserRow>(`/users/${id}`, data),
  delete: (id: string) => del<null>(`/users/${id}`),
}

// ── Departments ───────────────────────────────────────────────────────────────

export const departmentsApi = {
  list: () => fetch('/api/departments').then(r => r.json()).then(j => j.data as Department[]),
}

// ── Groups ────────────────────────────────────────────────────────────────────

export const groupsApi = {
  listByDept: (departmentId: string) => fetch(`/api/departments/${departmentId}/groups`).then(r => r.json()).then(j => j.data as Group[]),
  create: (data: { departmentId: string; name: string; code?: string | null; stage?: string | null; description?: string | null; sortOrder?: number }) =>
    post<Group>('/groups', data),
  update: (id: string, data: Partial<{ name: string; code: string | null; stage: string | null; description: string | null; sortOrder: number }>) =>
    patch<Group>(`/groups/${id}`, data),
  delete: (id: string) => del<null>(`/groups/${id}`),
}

// ── Stations ──────────────────────────────────────────────────────────────────

export const stationsApi = {
  listByDept: (departmentId: string) =>
    fetch(`/api/stations?department_id=${departmentId}`).then(r => r.json()).then(j => j.data as Station[]),
  create: (data: { departmentId: string; groupId?: string | null; name: string; code?: string | null; description?: string | null; sortOrder?: number }) =>
    post<Station>('/stations', data),
  update: (id: string, data: Partial<{ groupId: string | null; name: string; code: string | null; description: string | null; sortOrder: number }>) =>
    patch<Station>(`/stations/${id}`, data),
  delete: (id: string) => del<null>(`/stations/${id}`),
}

// ── Equipment ─────────────────────────────────────────────────────────────────

export interface Equipment { id: string; stationId: string; name: string; model: string | null; serialNumber: string | null; isActive: boolean }

export const equipmentApi = {
  listByStation: (stationId: string) => get<Equipment[]>(`/equipment?station_id=${stationId}`),
  create: (data: { stationId: string; name: string; model?: string | null; serialNumber?: string | null }) =>
    post<Equipment>('/equipment', data),
  update: (id: string, data: Partial<{ name: string; model: string | null; serialNumber: string | null }>) =>
    patch<Equipment>(`/equipment/${id}`, data),
  delete: (id: string) => del<null>(`/equipment/${id}`),
}

// ── Products ──────────────────────────────────────────────────────────────────

export const productsApi = {
  listByDept: (departmentId: string) =>
    fetch(`/api/products?department_id=${departmentId}`).then(r => r.json()).then(j => j.data as Product[]),
  create: (data: { departmentId: string; name: string; modelNumber: string; description?: string | null }) =>
    post<Product>('/products', data),
  update: (id: string, data: Partial<{ name: string; modelNumber: string; description: string | null }>) =>
    patch<Product>(`/products/${id}`, data),
  delete: (id: string) => del<null>(`/products/${id}`),
}

// ── Process Routes ────────────────────────────────────────────────────────────

export const routesApi = {
  listByDept: (departmentId: string) =>
    fetch(`/api/process-routes?department_id=${departmentId}`).then(r => r.json()).then(j => j.data as ProcessRoute[]),
  get: (id: string) => fetch(`/api/process-routes/${id}`).then(r => r.json()).then(j => j.data as ProcessRoute),
  steps: (id: string) => fetch(`/api/process-routes/${id}/steps`).then(r => r.json()).then(j => j.data as ProcessStep[]),
  create: (data: { departmentId: string; name: string; description?: string | null; version?: number }) =>
    post<ProcessRoute>('/process-routes', data),
  update: (id: string, data: Partial<{ name: string; description: string | null; isActive: boolean }>) =>
    patch<ProcessRoute>(`/process-routes/${id}`, data),
  delete: (id: string) => del<null>(`/process-routes/${id}`),
  addStep: (routeId: string, data: { stationId: string; stepOrder: number; standardTime?: number | null }) =>
    post<ProcessStep>(`/process-routes/${routeId}/steps`, data),
  updateStep: (routeId: string, stepId: string, data: Partial<{ stationId: string; stepOrder: number; standardTime: number | null }>) =>
    patch<ProcessStep>(`/process-routes/${routeId}/steps/${stepId}`, data),
  deleteStep: (routeId: string, stepId: string) => del<null>(`/process-routes/${routeId}/steps/${stepId}`),
}

// ── Work Orders ───────────────────────────────────────────────────────────────

export const workOrdersApi = {
  list: (params: { departmentId: string; status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams({ department_id: params.departmentId })
    if (params.status) q.set('status', params.status)
    if (params.page) q.set('page', String(params.page))
    if (params.limit) q.set('limit', String(params.limit))
    return get<{ items: WorkOrderRow[]; page: number; limit: number }>(`/work-orders?${q}`)
  },
  get: (id: string) => get<WorkOrderDetail>(`/work-orders/${id}`),
  create: (data: {
    departmentId: string; productId: string; routeId: string
    plannedQty: number; priority?: string; dueDate?: string | null
  }) => post<WorkOrder>('/work-orders', data),
  updateStatus: (id: string, status: string) => patch<WorkOrder>(`/work-orders/${id}/status`, { status }),
  qrcode: (id: string) => get<{ orderNumber: string; qrDataUrl: string; status: string }>(`/work-orders/${id}/qrcode`),
  print: (ids: string[]) => get<({ orderNumber: string; qrDataUrl: string; productName: string; modelNumber: string; plannedQty: number; dueDate: string | null; priority: string })[]>(`/work-orders/print?ids=${ids.join(',')}`),
}

// ── Customers ────────────────────────────────────────────────────────────────

export const customersApi = {
  list: () => get<Customer[]>('/customers'),
  create: (data: { code: string; name?: string | null; costFileCount?: number; needsNameMapping?: boolean }) =>
    post<Customer>('/customers', data),
  update: (id: string, data: Partial<{ code: string; name: string | null; costFileCount: number; needsNameMapping: boolean }>) =>
    patch<Customer>(`/customers/${id}`, data),
  delete: (id: string) => del<null>(`/customers/${id}`),
}

// ── Vendors ──────────────────────────────────────────────────────────────────

export const vendorsApi = {
  list: () => get<Vendor[]>('/vendors'),
  create: (data: { token: string; normalizedName: string; sourceFlags?: string | null; needsManualReview?: boolean }) =>
    post<Vendor>('/vendors', data),
  update: (id: string, data: Partial<{ token: string; normalizedName: string; sourceFlags: string | null; needsManualReview: boolean }>) =>
    patch<Vendor>(`/vendors/${id}`, data),
  delete: (id: string) => del<null>(`/vendors/${id}`),
}
