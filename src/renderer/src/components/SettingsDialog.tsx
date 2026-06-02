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
  const [holdMode, setHoldMode] = useState(current.hold_mode ?? false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    const delay = parseInt(initialDelay, 10)
    const interval = parseInt(repeatInterval, 10)

    if (!holdMode) {
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
    }

    onSave({
      initial_delay_ms: isNaN(delay) ? current.initial_delay_ms : delay,
      repeat_interval_ms: isNaN(interval) ? current.repeat_interval_ms : interval,
      use_interception: useInterception,
      hold_mode: holdMode,
    })
  }

  return (
    <Modal title="Configurações de simulação" subtitle="Comportamento ao segurar um botão do controle" onClose={onCancel}>
      <div className="p-5 space-y-4">
        {/* Seletor de Modo de Simulação */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
            Modo de Acionamento das Teclas
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => { setHoldMode(false); setError(null) }}
              className={`flex-1 p-3.5 rounded-lg border text-left transition-all ${
                !holdMode
                  ? 'bg-blue-50 border-blue-500 shadow-sm ring-2 ring-blue-100'
                  : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-bold ${!holdMode ? 'text-blue-700' : 'text-slate-700'}`}>
                  Disparo Individual (Repetição)
                </span>
                <input
                  type="radio"
                  checked={!holdMode}
                  onChange={() => {}}
                  className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                />
              </div>
              <span className="text-[10px] text-slate-400 block leading-tight">
                Fica enviando a tecla repetidamente a cada intervalo enquanto o botão estiver pressionado.
              </span>
            </button>

            <button
              onClick={() => { setHoldMode(true); setError(null) }}
              className={`flex-1 p-3.5 rounded-lg border text-left transition-all ${
                holdMode
                  ? 'bg-blue-50 border-blue-500 shadow-sm ring-2 ring-blue-100'
                  : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-bold ${holdMode ? 'text-blue-700' : 'text-slate-700'}`}>
                  Manter Pressionado (Contínuo)
                </span>
                <input
                  type="radio"
                  checked={holdMode}
                  onChange={() => {}}
                  className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                />
              </div>
              <span className="text-[10px] text-slate-400 block leading-tight">
                A tecla fica segurada de forma contínua no sistema operacional até que o botão do controle seja solto.
              </span>
            </button>
          </div>
        </div>

        {/* Parâmetros de repetição (apenas relevantes se não for holdMode) */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`card p-4 transition-all duration-200 ${holdMode ? 'opacity-40 select-none' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">Delay inicial (ms)</span>
              {!holdMode && <span className="text-[10px] text-slate-400 font-mono">50-2000</span>}
            </div>
            <input
              type="number"
              value={initialDelay}
              disabled={holdMode}
              onChange={(e) => { setInitialDelay(e.target.value); setError(null) }}
              min={50}
              max={2000}
              step={50}
              className={`w-full rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                holdMode ? 'bg-slate-50 cursor-not-allowed text-slate-400' : ''
              }`}
            />
          </div>

          <div className={`card p-4 transition-all duration-200 ${holdMode ? 'opacity-40 select-none' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">Repetição (ms)</span>
              {!holdMode && <span className="text-[10px] text-slate-400 font-mono">20-500</span>}
            </div>
            <input
              type="number"
              value={repeatInterval}
              disabled={holdMode}
              onChange={(e) => { setRepeatInterval(e.target.value); setError(null) }}
              min={20}
              max={500}
              step={10}
              className={`w-full rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                holdMode ? 'bg-slate-50 cursor-not-allowed text-slate-400' : ''
              }`}
            />
          </div>
        </div>

        {/* Emulação Kernel Interception */}
        <div className={`card p-4 flex items-center justify-between ${!isWindows ? 'opacity-50 select-none' : ''}`}>
          <div className="pr-4">
            <span className="text-sm font-semibold text-slate-700 block">
              Emular Teclado via Kernel {!isWindows && <span className="text-xs text-slate-400 font-normal ml-1">(Apenas Windows)</span>}
            </span>
            <span className="text-xs text-slate-400 block mt-0.5 leading-normal">
              Bypassa bloqueios anti-cheat em jogos e programas usando o driver de kernel Interception.
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

        {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
      </div>
      <div className="border-t border-slate-200 px-5 py-3 flex justify-end gap-2 bg-slate-50 rounded-b-lg">
        <button onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button onClick={handleSave} className="btn-primary">Salvar</button>
      </div>
    </Modal>
  )
}
