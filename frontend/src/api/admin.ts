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

// ── Shared pagination types ────────────────────────────────────────────────────

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface TableQuery {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

function buildTableQuery(p: TableQuery): URLSearchParams {
  const q = new URLSearchParams()
  if (p.page)    q.set('page', String(p.page))
  if (p.limit)   q.set('limit', String(p.limit))
  if (p.search)  q.set('search', p.search)
  if (p.sortBy)  q.set('sort_by', p.sortBy)
  if (p.sortDir) q.set('sort_dir', p.sortDir)
  return q
}

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
  id: string; departmentId: string; groupId: string | null; groupName: string | null; name: string
  code: string | null; description: string | null; sortOrder: number; isActive: boolean
  createdAt: string; updatedAt: string
}

export interface ProductCategory {
  id: string; name: string; code: string | null; description: string | null
  sortOrder: number; isActive: boolean; createdAt: string; updatedAt: string
}

export interface Product {
  id: string; departmentId: string; name: string; modelNumber: string
  description: string | null; isActive: boolean; createdAt: string
  categoryId: string | null; categoryName: string | null
  routeId: string | null; routeName: string | null
}

export type TemplateType = 'single_sided' | 'double_sided' | 'multi_layer' | 'rigid_flex'

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  single_sided: '單面板',
  double_sided: '雙面板',
  multi_layer: '多層板',
  rigid_flex: '軟硬結合板',
}

export interface ProcessRoute {
  id: string; departmentId: string; name: string; description: string | null
  isActive: boolean; version: number
  isTemplate: boolean; templateType: TemplateType | null
  createdAt: string
}

export interface ProcessStep {
  id: string; routeId: string; stationId: string; stationName: string
  stationCode: string | null; stepOrder: number; standardTime: number | null; createdAt: string
}

export interface WorkOrder {
  id: string; orderNumber: string; departmentId: string; productId: string
  routeId: string; plannedQty: number; orderQty: number | null; status: string; priority: string
  dueDate: string | null; createdAt: string; updatedAt: string
}

export interface WorkOrderRow {
  workOrder: WorkOrder & { note?: string | null }
  product: { name: string; modelNumber: string; description?: string | null }
  route?: { name: string; description?: string | null }
}

export interface WorkOrderDetail extends WorkOrderRow {
  logs: {
    id: string; stationName: string; stationCode: string | null; status: string
    checkInTime: string; checkOutTime: string | null
    actualQtyIn: number | null; actualQtyOut: number | null
  }[]
}

export interface Equipment { id: string; stationId: string; name: string; model: string | null; serialNumber: string | null; notes: string | null; isActive: boolean }

export interface DeviceToken {
  id: string; token: string; isUsed: boolean
  deviceId: string | null; deviceName: string | null
  createdAt: string; usedAt: string | null
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
  list: (p: TableQuery = {}) => get<Paged<Role>>(`/roles?${buildTableQuery(p)}`),
  /** For dropdowns — returns all roles without pagination */
  listAll: () => fetch('/api/admin/roles?limit=200').then(r => r.json()).then(j => (j.data as Paged<Role>).items),
  create: (data: { name: string; description?: string }) => post<Role>('/roles', data),
  delete: (id: string) => del<null>(`/roles/${id}`),
}

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: (p: TableQuery = {}) => get<Paged<AdminUserRow>>(`/users?${buildTableQuery(p)}`),
  create: (data: { username: string; password: string; roleId?: string | null }) => post<AdminUserRow>('/users', data),
  update: (id: string, data: { roleId?: string | null; isActive?: boolean; password?: string }) => patch<AdminUserRow>(`/users/${id}`, data),
  delete: (id: string) => del<null>(`/users/${id}`),
}

// ── Departments ───────────────────────────────────────────────────────────────

export const departmentsApi = {
  list: () => fetch('/api/departments').then(r => r.json()).then(j => j.data as Department[]),
  create: (data: { name: string; code: string }) => post<Department>('/departments', data),
  update: (id: string, data: Partial<{ name: string; code: string }>) => patch<Department>(`/departments/${id}`, data),
  delete: (id: string) => del<null>(`/departments/${id}`),
}

// ── Groups ────────────────────────────────────────────────────────────────────

export const groupsApi = {
  list: (departmentId: string, p: TableQuery & { isActive?: string } = {}) => {
    const q = buildTableQuery(p)
    q.set('department_id', departmentId)
    if (p.isActive) q.set('is_active', p.isActive)
    return get<Paged<Group>>(`/groups?${q}`)
  },
  /** For dropdowns — returns all groups for a dept without pagination */
  listAll: (departmentId: string) =>
    fetch(`/api/departments/${departmentId}/groups`).then(r => r.json()).then(j => j.data as Group[]),
  create: (data: { departmentId: string; name: string; code?: string | null; stage?: string | null; description?: string | null; sortOrder?: number }) =>
    post<Group>('/groups', data),
  update: (id: string, data: Partial<{ name: string; code: string | null; stage: string | null; description: string | null; sortOrder: number }>) =>
    patch<Group>(`/groups/${id}`, data),
  delete: (id: string) => del<null>(`/groups/${id}`),
  reorder: (items: { id: string; sortOrder: number }[]) => patch<null>('/groups/reorder', items),
}

// ── Stations ──────────────────────────────────────────────────────────────────

export const stationsApi = {
  list: (departmentId: string, p: TableQuery & { groupId?: string; isActive?: string } = {}) => {
    const q = buildTableQuery(p)
    q.set('department_id', departmentId)
    if (p.groupId) q.set('group_id', p.groupId)
    if (p.isActive) q.set('is_active', p.isActive)
    return get<Paged<Station>>(`/stations?${q}`)
  },
  /** For dropdowns — returns all active stations without pagination */
  listAll: (departmentId: string) =>
    fetch(`/api/stations?department_id=${departmentId}`).then(r => r.json()).then(j => j.data as Station[]),
  create: (data: { departmentId: string; groupId?: string | null; name: string; code?: string | null; description?: string | null; sortOrder?: number }) =>
    post<Station>('/stations', data),
  update: (id: string, data: Partial<{ groupId: string | null; name: string; code: string | null; description: string | null; sortOrder: number }>) =>
    patch<Station>(`/stations/${id}`, data),
  delete: (id: string) => del<null>(`/stations/${id}`),
}

// ── Equipment ─────────────────────────────────────────────────────────────────

export const equipmentApi = {
  list: (stationId: string, p: TableQuery & { isActive?: string } = {}) => {
    const q = buildTableQuery(p)
    q.set('station_id', stationId)
    if (p.isActive) q.set('is_active', p.isActive)
    return get<Paged<Equipment>>(`/equipment?${q}`)
  },
  create: (data: { stationId: string; name: string; model?: string | null; serialNumber?: string | null; notes?: string | null }) =>
    post<Equipment>('/equipment', data),
  update: (id: string, data: Partial<{ name: string; model: string | null; serialNumber: string | null; notes: string | null }>) =>
    patch<Equipment>(`/equipment/${id}`, data),
  delete: (id: string) => del<null>(`/equipment/${id}`),
}

// ── Product Categories ────────────────────────────────────────────────────────

export const categoriesApi = {
  list: (p: TableQuery & { isActive?: string } = {}) => {
    const q = buildTableQuery(p)
    if (p.isActive) q.set('is_active', p.isActive)
    return get<Paged<ProductCategory>>(`/product-categories?${q}`)
  },
  /** For dropdowns */
  listAll: () => fetch('/api/admin/product-categories?limit=200').then(r => r.json()).then(j => (j.data as Paged<ProductCategory>).items),
  create: (data: { name: string; code?: string | null; description?: string | null; sortOrder?: number }) =>
    post<ProductCategory>('/product-categories', data),
  update: (id: string, data: Partial<{ name: string; code: string | null; description: string | null; sortOrder: number }>) =>
    patch<ProductCategory>(`/product-categories/${id}`, data),
  delete: (id: string) => del<null>(`/product-categories/${id}`),
}

// ── Products ──────────────────────────────────────────────────────────────────

export const productsApi = {
  list: (departmentId: string, p: TableQuery & { categoryId?: string; routeFilter?: 'all' | 'set' | 'unset'; isActive?: string } = {}) => {
    const q = buildTableQuery(p)
    q.set('department_id', departmentId)
    if (p.categoryId)   q.set('category_id', p.categoryId)
    if (p.routeFilter)  q.set('route_filter', p.routeFilter)
    if (p.isActive)     q.set('is_active', p.isActive)
    return get<Paged<Product>>(`/products?${q}`)
  },
  /** For dropdowns */
  listAll: (departmentId: string) =>
    fetch(`/api/products?department_id=${departmentId}`).then(r => r.json()).then(j => j.data as Product[]),
  create: (data: { departmentId: string; name: string; modelNumber: string; description?: string | null; categoryId?: string | null; routeId?: string | null }) =>
    post<Product>('/products', data),
  update: (id: string, data: Partial<{ name: string; modelNumber: string; description: string | null; categoryId: string | null; routeId: string | null }>) =>
    patch<Product>(`/products/${id}`, data),
  delete: (id: string) => del<null>(`/products/${id}`),
}

// ── Process Routes ────────────────────────────────────────────────────────────

export const routesApi = {
  list: (departmentId: string, p: TableQuery & { isTemplate?: string; isActive?: string } = {}) => {
    const q = buildTableQuery(p)
    q.set('department_id', departmentId)
    if (p.isTemplate) q.set('is_template', p.isTemplate)
    if (p.isActive)   q.set('is_active', p.isActive)
    return get<Paged<ProcessRoute>>(`/process-routes?${q}`)
  },
  /** For dropdowns — all active non-template routes */
  listAll: (departmentId: string) =>
    fetch(`/api/process-routes?department_id=${departmentId}`).then(r => r.json()).then(j => j.data as ProcessRoute[]),
  /** For template dropdowns — all active templates for a dept */
  listTemplates: (departmentId: string) => {
    const q = new URLSearchParams({ department_id: departmentId, is_template: 'true', limit: '100' })
    return get<Paged<ProcessRoute>>(`/process-routes?${q}`).then(p => p.items)
  },
  get: (id: string) => fetch(`/api/process-routes/${id}`).then(r => r.json()).then(j => j.data as ProcessRoute),
  steps: (id: string) => fetch(`/api/process-routes/${id}/steps`).then(r => r.json()).then(j => j.data as ProcessStep[]),
  create: (data: { departmentId: string; name: string; description?: string | null; version?: number; isTemplate?: boolean; templateType?: string | null }) =>
    post<ProcessRoute>('/process-routes', data),
  update: (id: string, data: Partial<{ name: string; description: string | null; isActive: boolean; templateType: string | null }>) =>
    patch<ProcessRoute>(`/process-routes/${id}`, data),
  delete: (id: string) => del<null>(`/process-routes/${id}`),
  addStep: (routeId: string, data: { stationId: string; stepOrder: number; standardTime?: number | null }) =>
    post<ProcessStep>(`/process-routes/${routeId}/steps`, data),
  updateStep: (routeId: string, stepId: string, data: Partial<{ stationId: string; stepOrder: number; standardTime: number | null }>) =>
    patch<ProcessStep>(`/process-routes/${routeId}/steps/${stepId}`, data),
  deleteStep: (routeId: string, stepId: string) => del<null>(`/process-routes/${routeId}/steps/${stepId}`),
  cloneTemplate: (templateId: string, data: { name: string; description?: string }) =>
    post<ProcessRoute>(`/process-routes/${templateId}/clone`, data),
}

// ── Work Orders ───────────────────────────────────────────────────────────────

export interface SplitChildResult {
  id: string
  orderNumber: string
  plannedQty: number
  priority: string
  dueDate: string | null
  qrDataUrl: string
}

export interface SplitResult {
  parentOrderNumber: string
  parentStatus: string
  children: SplitChildResult[]
}

export const workOrdersApi = {
  list: (p: TableQuery & { departmentId: string; status?: string }) => {
    const q = buildTableQuery(p)
    q.set('department_id', p.departmentId)
    if (p.status) q.set('status', p.status)
    return get<Paged<WorkOrderRow>>(`/work-orders?${q}`)
  },
  get: (id: string) => get<WorkOrderDetail>(`/work-orders/${id}`),
  create: (data: {
    departmentId: string; productId: string
    orderQty: number; plannedQty?: number; priority?: string; dueDate?: string | null
    note?: string | null
  }) => post<WorkOrder>('/work-orders', data),
  update: (id: string, data: Partial<{
    orderNumber: string; orderQty: number; plannedQty: number; priority: string
    dueDate: string | null; note: string | null; productId: string
  }>) => patch<WorkOrder>(`/work-orders/${id}`, data),
  updateStatus: (id: string, status: string) => patch<WorkOrder>(`/work-orders/${id}/status`, { status }),
  qrcode: (id: string) => get<{ orderNumber: string; qrDataUrl: string; status: string }>(`/work-orders/${id}/qrcode`),
  print: (ids: string[]) => get<({ orderNumber: string; qrDataUrl: string; productName: string; modelNumber: string; plannedQty: number; orderQty: number | null; dueDate: string | null; priority: string })[]>(`/work-orders/print?ids=${ids.join(',')}`),
  split: (id: string, data: {
    splitReason: 'rush' | 'batch_shipment'
    splitNote?: string
    children: { plannedQty: number; priority?: 'normal' | 'urgent'; dueDate?: string | null }[]
  }) => post<SplitResult>(`/work-orders/${id}/split`, data),
}

// ── Device Tokens ─────────────────────────────────────────────────────────────

export const deviceTokensApi = {
  list: (p: TableQuery & { isUsed?: string } = {}) => {
    const q = buildTableQuery(p)
    if (p.isUsed) q.set('is_used', p.isUsed)
    return get<Paged<DeviceToken>>(`/device-tokens?${q}`)
  },
  generateBatch: (count: number) => post<DeviceToken[]>('/device-tokens/batch', { count }),
  revoke: (id: string) => del<null>(`/device-tokens/${id}`),
}

// ── Customers ────────────────────────────────────────────────────────────────

export const customersApi = {
  list: (p: TableQuery & { isActive?: string } = {}) => {
    const q = buildTableQuery(p)
    if (p.isActive) q.set('is_active', p.isActive)
    return get<Paged<Customer>>(`/customers?${q}`)
  },
  create: (data: { code: string; name?: string | null; costFileCount?: number; needsNameMapping?: boolean }) =>
    post<Customer>('/customers', data),
  update: (id: string, data: Partial<{ code: string; name: string | null; costFileCount: number; needsNameMapping: boolean }>) =>
    patch<Customer>(`/customers/${id}`, data),
  delete: (id: string) => del<null>(`/customers/${id}`),
}

// ── Vendors ──────────────────────────────────────────────────────────────────

export const vendorsApi = {
  list: (p: TableQuery & { isActive?: string; needsReview?: string } = {}) => {
    const q = buildTableQuery(p)
    if (p.isActive)     q.set('is_active', p.isActive)
    if (p.needsReview)  q.set('needs_review', p.needsReview)
    return get<Paged<Vendor>>(`/vendors?${q}`)
  },
  create: (data: { token: string; normalizedName: string; sourceFlags?: string | null; needsManualReview?: boolean }) =>
    post<Vendor>('/vendors', data),
  update: (id: string, data: Partial<{ token: string; normalizedName: string; sourceFlags: string | null; needsManualReview: boolean }>) =>
    patch<Vendor>(`/vendors/${id}`, data),
  delete: (id: string) => del<null>(`/vendors/${id}`),
}
