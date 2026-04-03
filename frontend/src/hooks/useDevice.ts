import { useState, useEffect, useCallback } from 'react'
import { devicesApi, type DeviceInfo } from '../api'

const STORAGE_KEY = 'wip_device_id'

export function getStoredDeviceId(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function saveDeviceId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id)
}

export function clearDeviceId(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export interface UseDeviceResult {
  deviceId: string | null
  deviceInfo: DeviceInfo | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useDevice(): UseDeviceResult {
  const [deviceId] = useState<string | null>(getStoredDeviceId)
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!deviceId) return
    setLoading(true)
    setError(null)
    devicesApi
      .get(deviceId)
      .then(setDeviceInfo)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [deviceId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Heartbeat every 5 minutes
  useEffect(() => {
    if (!deviceId) return
    const timer = setInterval(() => {
      devicesApi.heartbeat(deviceId).catch(() => {/* silent */})
    }, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [deviceId])

  return { deviceId, deviceInfo, loading, error, refresh }
}

// 採集 fingerprint 資訊
export function collectFingerprint() {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl')
  const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info')
  const webglRenderer = debugInfo
    ? gl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string | undefined
    : undefined

  return {
    userAgent: navigator.userAgent,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenInfo: {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
    },
    webglRenderer: webglRenderer ?? null,
  }
}
