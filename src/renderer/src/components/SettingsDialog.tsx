import { useState } from 'react'
import type { RepeatSettings } from '../../../shared/models'
import Modal from './Modal'

interface Props {
  current: RepeatSettings
  onSave: (settings: RepeatSettings) => void
  onCancel: () => void
}

export default function SettingsDialog({ current, onSave, onCancel }: Props) {
  const isWindows = window.api.platform === 'win32'
  const [initialDelay, setInitialDelay] = useState(String(current.initial_delay_ms))
  const [repeatInterval, setRepeatInterval] = useState(String(current.repeat_interval_ms))
  const [useInterception, setUseInterception] = useState(isWindows ? (current.use_interception ?? false) : false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    const delay = parseInt(initialDelay, 10)
    const interval = parseInt(repeatInterval, 10)

    if (isNaN(delay) || isNaN(interval)) {
      setError('Insira valores numéricos válidos.')
      return
    }
    if (delay < 50 || delay > 2000) {
      setError('Delay inicial deve estar entre 50 e 2000 ms.')
      return
    }
    if (interval < 20 || interval > 500) {
      setError('Intervalo de repetição deve estar entre 20 e 500 ms.')
      return
    }

    onSave({
      initial_delay_ms: delay,
      repeat_interval_ms: interval,
      use_interception: useInterception,
    })
  }

  return (
    <Modal title="Configurações de repetição" subtitle="Comportamento ao segurar um botão do controle" onClose={onCancel}>
      <div className="p-5 space-y-3">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Delay inicial (ms)</span>
            <span className="text-xs text-slate-400">50 – 2000 ms</span>
          </div>
          <input
            type="number"
            value={initialDelay}
            onChange={(e) => { setInitialDelay(e.target.value); setError(null) }}
            min={50}
            max={2000}
            step={50}
            className="w-28 rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Intervalo de repetição (ms)</span>
            <span className="text-xs text-slate-400">20 – 500 ms</span>
          </div>
          <input
            type="number"
            value={repeatInterval}
            onChange={(e) => { setRepeatInterval(e.target.value); setError(null) }}
            min={20}
            max={500}
            step={10}
            className="w-28 rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div className={`card p-4 flex items-center justify-between ${!isWindows ? 'opacity-50 select-none' : ''}`}>
          <div className="pr-4">
            <span className="text-sm font-semibold text-slate-700 block">
              Emular Teclado via Kernel {!isWindows && <span className="text-xs text-slate-400 font-normal ml-1">(Apenas Windows)</span>}
            </span>
            <span className="text-xs text-slate-400 block mt-0.5">
              Bypassa bloqueios em jogos e programas usando o driver Interception.
            </span>
          </div>
          <input
            type="checkbox"
            checked={useInterception}
            disabled={!isWindows}
            onChange={(e) => setUseInterception(e.target.checked)}
            className={`h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 ${isWindows ? 'cursor-pointer' : 'cursor-not-allowed'}`}
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
      <div className="border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button onClick={handleSave} className="btn-primary">Salvar</button>
      </div>
    </Modal>
  )
}
