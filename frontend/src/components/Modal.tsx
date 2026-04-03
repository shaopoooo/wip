import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title?: string
  children: ReactNode
  onClose?: () => void
  size?: 'md' | 'lg'
}

export function Modal({ open, title, children, onClose, size = 'md' }: ModalProps) {
  if (!open) return null

  const maxW = size === 'lg' ? 'max-w-2xl' : 'max-w-lg'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${maxW} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <span className="text-lg font-bold text-slate-800">{title}</span>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="關閉"
                className="text-slate-400 hover:text-slate-600 text-xl leading-none p-1 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
