import { useEffect, useState } from 'react'
import type { ChordInput, CaptureResult, Mapping } from '../../../shared/models'
import Modal from './Modal'

interface Props {
  deviceId: number
  existingMappings: Mapping[]
  onConfirm: (mapping: Mapping) => void
  onCancel: () => void
}

// Capture phase state machine:
//  ctrl-primary → idle → (ctrl-extra → idle)* → key → ready
type CapturePhase = 'ctrl-primary' | 'idle' | 'ctrl-extra' | 'key' | 'ready'

function captureResultToChordInput(r: CaptureResult): ChordInput | null {
  if (r.type === 'diagonal') return null
  return {
    type: r.type,
    button_id: r.button_id,
    button_name: r.button_name,
    axis_direction: r.type === 'axis' ? r.axis_direction : undefined,
  }
}

// Returns a canonical label for all captured inputs joined with " + "
function inputsLabel(primary: CaptureResult, extras: ChordInput[]): string {
  return [primary.button_name, ...extras.map((e) => e.button_name)].join(' + ')
}

export default function AddMappingDialog({ deviceId, existingMappings, onConfirm, onCancel }: Props) {
  const [phase, setPhase] = useState<CapturePhase>('ctrl-primary')
  const [primaryCapture, setPrimaryCapture] = useState<CaptureResult | null>(null)
  const [chordInputs, setChordInputs] = useState<ChordInput[]>([])
  const [keyCombo, setKeyCombo] = useState<string | null>(null)

  // Start primary controller capture automatically on open
  useEffect(() => {
    if (phase !== 'ctrl-primary') return
    window.api.invoke('controller:capture-start', deviceId)
    const off = window.api.on('controller:button-captured', (result) => {
      setPrimaryCapture(result)
      setChordInputs([])
      setPhase('idle')
    })
    return () => {
      off()
      window.api.invoke('controller:capture-stop')
    }
  }, [phase, deviceId])

  // Capture an additional chord input
  useEffect(() => {
    if (phase !== 'ctrl-extra') return
    window.api.invoke('controller:capture-start', deviceId)
    const off = window.api.on('controller:button-captured', (result) => {
      const ci = captureResultToChordInput(result)
      if (ci) {
        setChordInputs((prev) => {
          // Deduplicate by type + button_id + axis_direction
          const key = `${ci.type}:${ci.button_id}:${ci.axis_direction ?? 0}`
          const primaryKey = primaryCapture
            ? `${primaryCapture.type}:${primaryCapture.button_id}:${primaryCapture.type === 'axis' ? primaryCapture.axis_direction : 0}`
            : ''
          if (key === primaryKey || prev.some((e) => `${e.type}:${e.button_id}:${e.axis_direction ?? 0}` === key)) {
            return prev
          }
          return [...prev, ci]
        })
      }
      setPhase('idle')
    })
    return () => {
      off()
      window.api.invoke('controller:capture-stop')
    }
  }, [phase, deviceId, primaryCapture])

  // Key capture
  useEffect(() => {
    if (phase !== 'key') return
    window.api.invoke('keyboard:capture-start')
    const off = window.api.on('keyboard:key-captured', (combo) => {
      setKeyCombo(combo)
      setPhase('ready')
    })
    return () => {
      off()
      window.api.invoke('keyboard:capture-stop')
    }
  }, [phase])

  const isOverwrite = primaryCapture
    ? existingMappings.some((m) => {
        if (m.source_type !== primaryCapture.type) return false
        if (m.button_id !== primaryCapture.button_id) return false
        if (primaryCapture.type === 'axis' && m.axis_direction !== primaryCapture.axis_direction) return false
        if (primaryCapture.type === 'diagonal') {
          return (
            m.axis_direction === primaryCapture.axis_direction &&
            m.axis_id_y === primaryCapture.axis_id_y &&
            m.axis_direction_y === primaryCapture.axis_direction_y
          )
        }
        // For chords, same primary + same chord set = overwrite
        const newChordKey = chordInputs.map((c) => `${c.type}:${c.button_id}:${c.axis_direction ?? 0}`).sort().join('|')
        const existChordKey = (m.chord_inputs ?? []).map((c) => `${c.type}:${c.button_id}:${c.axis_direction ?? 0}`).sort().join('|')
        return newChordKey === existChordKey
      })
    : false

  const handleConfirm = () => {
    if (!primaryCapture || !keyCombo) return
    const mapping: Mapping = {
      button_id: primaryCapture.button_id,
      button_name: primaryCapture.button_name,
      key_combo: keyCombo,
      source_type: primaryCapture.type,
      axis_direction: primaryCapture.type !== 'button' ? primaryCapture.axis_direction : 0,
      axis_id_y: primaryCapture.type === 'diagonal' ? primaryCapture.axis_id_y : null,
      axis_direction_y: primaryCapture.type === 'diagonal' ? primaryCapture.axis_direction_y : 0,
      chord_inputs: chordInputs.length > 0 ? chordInputs : undefined,
    }
    onConfirm(mapping)
  }

  const recaptureCtrl = () => {
    setPhase('ctrl-primary')
    setPrimaryCapture(null)
    setChordInputs([])
    setKeyCombo(null)
  }

  const addChordInput = () => setPhase('ctrl-extra')

  const removeChordInput = (idx: number) =>
    setChordInputs((prev) => prev.filter((_, i) => i !== idx))

  const proceedToKey = () => setPhase('key')

  const recaptureKey = () => {
    setKeyCombo(null)
    setPhase('key')
  }

  return (
    <Modal title="Novo mapeamento" subtitle="Pressione um botão no controle e uma tecla no teclado" onClose={onCancel}>
      <div className="flex gap-4 p-5">

        {/* Controller panel */}
        <div className="flex-1 card p-4 text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Controle</p>

          {phase === 'ctrl-primary' ? (
            <p className="text-sm text-slate-400 animate-pulse">Aguardando...</p>
          ) : phase === 'ctrl-extra' ? (
            <p className="text-sm text-indigo-400 animate-pulse">Pressione mais um botão...</p>
          ) : primaryCapture ? (
            <div className="flex flex-col items-center gap-2">
              {/* Primary + chord badges */}
              <div className="flex flex-wrap justify-center gap-1">
                <button onClick={recaptureCtrl} className="badge-ctrl text-sm px-3 py-1 cursor-pointer">
                  {primaryCapture.button_name}
                </button>
                {chordInputs.map((ci, idx) => (
                  <span key={idx} className="flex items-center gap-0.5">
                    <span className="text-slate-400 text-xs">+</span>
                    <span className="badge-ctrl text-sm px-2 py-1 flex items-center gap-1">
                      {ci.button_name}
                      <button onClick={() => removeChordInput(idx)} className="text-slate-400 hover:text-red-500 leading-none ml-0.5">×</button>
                    </span>
                  </span>
                ))}
              </div>
              {/* Chord action buttons */}
              <div className="flex gap-2 mt-1">
                <button onClick={addChordInput} className="btn-ghost text-xs px-2 py-1">
                  ＋ Adicionar
                </button>
                {(phase === 'idle') && (
                  <button onClick={proceedToKey} className="btn-ctrl text-xs px-2 py-1">
                    → Tecla
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {phase === 'ctrl-primary' && (
            <p className="text-xs text-slate-400 mt-2">Pressione um botão ou mova um eixo</p>
          )}
          {phase === 'ctrl-extra' && (
            <p className="text-xs text-slate-400 mt-2">
              <button onClick={() => setPhase('idle')} className="text-indigo-400 underline">Cancelar</button>
            </p>
          )}
          {(phase === 'idle' || phase === 'key' || phase === 'ready') && primaryCapture && chordInputs.length === 0 && (
            <p className="text-xs text-slate-400 mt-2">Clique para substituir</p>
          )}
        </div>

        <div className="flex items-center text-slate-300 text-lg font-bold">──►</div>

        {/* Key panel */}
        <div className="flex-1 card p-4 text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Teclado</p>
          {phase === 'key' ? (
            <p className="text-sm text-slate-400 animate-pulse">Aguardando...</p>
          ) : keyCombo ? (
            <button onClick={recaptureKey} className="badge-key text-sm px-3 py-1 cursor-pointer">
              {keyCombo}
            </button>
          ) : (
            <p className="text-sm text-slate-400">–</p>
          )}
          <p className="text-xs text-slate-400 mt-2">
            {phase === 'key'
              ? 'Pressione uma tecla ou atalho'
              : keyCombo
                ? 'Clique para substituir'
                : phase === 'idle'
                  ? 'Clique em "→ Tecla" para continuar'
                  : 'Aguardando controle primeiro'}
          </p>
        </div>
      </div>

      {isOverwrite && (
        <p className="text-xs text-amber-600 px-5 pb-1">⚠ Este mapeamento já existe — confirmar irá sobrescrever</p>
      )}

      <div className="border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button
          onClick={handleConfirm}
          disabled={phase !== 'ready'}
          className="btn-primary"
        >
          Confirmar
        </button>
      </div>
    </Modal>
  )
}
