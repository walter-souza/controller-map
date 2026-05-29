import { useEffect, useState } from 'react'
import type { DeviceInfo } from '../../../shared/models'

interface Props {
  onSelect: (device: DeviceInfo) => void
}

export default function DeviceScreen({ onSelect }: Props) {
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    setLoading(true)
    window.api.invoke('controller:list').then((list) => {
      setDevices(list)
      setLoading(false)
    })
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-slate-800 px-6 py-4">
        <h1 className="text-white text-base font-semibold">controller-map</h1>
        <p className="text-slate-400 text-xs mt-0.5">Selecione um controle conectado</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {loading && devices.length === 0 && (
          <p className="text-slate-400 text-sm text-center mt-8">Buscando controles...</p>
        )}
        {!loading && devices.length === 0 && (
          <div className="text-center mt-8">
            <p className="text-slate-500 text-sm">Nenhum controle encontrado.</p>
            <p className="text-slate-400 text-xs mt-1">Conecte um controle e aguarde.</p>
          </div>
        )}
        {devices.map((d) => (
          <button
            key={d.id}
            onClick={() => onSelect(d)}
            className="w-full card px-5 py-4 text-left hover:border-blue-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700">{d.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">ID: {d.id}</p>
              </div>
              <span className="text-slate-300 group-hover:text-blue-400 text-lg">›</span>
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 bg-white px-6 py-3 flex justify-end">
        <button onClick={refresh} className="btn-secondary text-xs">
          ↻ Atualizar
        </button>
      </div>
    </div>
  )
}
