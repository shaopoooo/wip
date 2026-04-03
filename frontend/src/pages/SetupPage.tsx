import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { departmentsApi, devicesApi, type Department } from '../api'
import { saveDeviceId, collectFingerprint } from '../hooks/useDevice'

type Step = 'dept' | 'info' | 'registering'

export function SetupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('dept')
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    departmentsApi.list().then(setDepartments).catch(() => setError('無法載入部門資料'))
  }, [])

  const selectDept = (dept: Department) => {
    setSelectedDept(dept)
    setError(null)
    setStep('info')
  }

  const register = async () => {
    if (!selectedDept) return
    setStep('registering')
    setError(null)
    const fp = collectFingerprint()
    try {
      const result = await devicesApi.register({
        departmentId: selectedDept.id,
        deviceType: 'tablet',
        name: deviceName.trim() || undefined,
        employeeId: employeeId.trim() || undefined,
        ...fp,
        screenInfo: fp.screenInfo,
      })
      saveDeviceId(result.id)
      navigate('/scan', { replace: true })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '裝置註冊失敗，請重試')
      setStep('info')
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-900 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-8">
        <h1 className="text-2xl font-extrabold text-blue-600 text-center">WIP 追蹤系統</h1>
        <p className="text-slate-400 text-center mt-1 mb-6 text-sm">首次使用，請設定此裝置</p>

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
        )}

        {/* 選部門 */}
        {step === 'dept' && (
          <div>
            <h2 className="font-semibold text-slate-700 mb-3">選擇所屬產線</h2>
            <div className="grid grid-cols-2 gap-3">
              {departments.map((d) => (
                <button
                  key={d.id}
                  onClick={() => selectDept(d)}
                  className="flex flex-col items-center justify-center py-6 px-4 border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer gap-1"
                >
                  <span className="text-4xl font-extrabold text-blue-600">{d.code}</span>
                  <span className="text-sm text-slate-500">{d.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 填資訊 */}
        {step === 'info' && (
          <div>
            <h2 className="font-semibold text-slate-700 mb-3">裝置資訊</h2>
            <div className="bg-blue-50 text-blue-700 rounded-lg px-4 py-2.5 mb-4 text-sm">
              所屬產線：<strong>{selectedDept?.name}</strong>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">裝置名稱（選填）</label>
                <input
                  type="text"
                  placeholder="例：A線-平板-01"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  maxLength={100}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">員工工號（選填）</label>
                <input
                  type="text"
                  placeholder="輸入工號"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  maxLength={50}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setStep('dept')}
                className="px-4 py-2.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                ← 返回
              </button>
              <button
                onClick={register}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors cursor-pointer active:scale-95"
              >
                確認綁定
              </button>
            </div>
          </div>
        )}

        {/* 註冊中 */}
        {step === 'registering' && (
          <div className="flex flex-col items-center gap-3 py-8 text-slate-500">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            <p>正在註冊裝置...</p>
          </div>
        )}
      </div>
    </div>
  )
}
