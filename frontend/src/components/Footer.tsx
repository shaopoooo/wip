import { useEffect, useState } from 'react'

export function Footer() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-t border-slate-800 shrink-0 text-xs text-slate-500">
      <span>WIP 系統 &copy; {time.getFullYear()}</span>
      <span>{time.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}</span>
    </div>
  )
}
