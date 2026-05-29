import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}

export default function Modal({ title, subtitle, onClose, children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-slate-800 px-5 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-white text-sm font-semibold">{title}</h2>
            {subtitle && <p className="text-slate-400 text-xs mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none ml-4 transition-colors">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
