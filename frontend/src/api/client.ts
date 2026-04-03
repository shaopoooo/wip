const BASE = '/api'

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// 錯誤碼 → 中文訊息
const ERROR_MESSAGES: Record<string, string> = {
  WRONG_DEPARTMENT: '此工單不屬於本產線，請確認掃描裝置的站點設定',
  SKIP_STATION: '此站點不在工單的工序路由中',
  DUPLICATE_SCAN: '30 秒內已掃描此工單，請確認是否重複操作',
  ORDER_CLOSED: '工單已結案（取消或完工），無法繼續操作',
  ORDER_ALREADY_SPLIT: '此工單已拆分，請掃描對應的子單',
  SPLIT_QTY_MISMATCH: '子單數量總和與母單數量不符',
  UNAUTHORIZED: '裝置未認證，請重新設定',
  NOT_FOUND: '找不到對應資料',
  VALIDATION_ERROR: '資料格式錯誤',
  INTERNAL_ERROR: '伺服器錯誤，請稍後再試',
}

export function toChineseError(code: string, fallback: string): string {
  return ERROR_MESSAGES[code] ?? fallback
}

async function request<T>(
  path: string,
  options: RequestInit & { deviceId?: string } = {},
): Promise<T> {
  const { deviceId, ...init } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (deviceId) headers['x-device-id'] = deviceId

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  const json = (await res.json()) as { success: boolean; data?: T; error?: { code: string; message: string } }

  if (!json.success || !res.ok) {
    const code = json.error?.code ?? 'INTERNAL_ERROR'
    const message = json.error?.message ?? '未知錯誤'
    throw new ApiError(code, toChineseError(code, message), res.status)
  }

  return json.data as T
}

export const api = {
  get: <T>(path: string, opts?: { deviceId?: string; params?: Record<string, string> }) => {
    const url = opts?.params
      ? `${path}?${new URLSearchParams(opts.params).toString()}`
      : path
    return request<T>(url, { method: 'GET', deviceId: opts?.deviceId })
  },
  post: <T>(path: string, body: unknown, opts?: { deviceId?: string }) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), deviceId: opts?.deviceId }),
  patch: <T>(path: string, body: unknown, opts?: { deviceId?: string }) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body), deviceId: opts?.deviceId }),
}
