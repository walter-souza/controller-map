import { useEffect, useState } from 'react'
import type { ChordInput, CaptureResult, Mapping } from '../../../shared/models'
import Modal from './Modal'

interface Props {
  deviceId: number
  existingMappings: Mapping[]
  onConfirm: (mapping: Mapping) => void
  onCancel: () => void
}

// Capture phase state machine: chord-capture → key → ready
type CapturePhase = 'chord-capture' | 'key' | 'ready'

export default function AddMappingDialog({ deviceId, existingMappings, onConfirm, onCancel }: Props) {
  const [phase, setPhase] = useState<CapturePhase>('chord-capture')
  const [capturedInputs, setCapturedInputs] = useState<CaptureResult[]>([])
  const [keyCombo, setKeyCombo] = useState<string | null>(null)

  // Chord capture: accumulates all simultaneously held buttons; fires on release
  useEffect(() => {
    if (phase !== 'chord-capture') return
    window.api.invoke('controller:chord-capture-start', deviceId)
    const off = window.api.on('controller:chord-captured', (results) => {
      setCapturedInputs(results)
      // Auto-proceed to key capture
      setPhase('key')
    })
    return () => {
      off()
      window.api.invoke('controller:chord-capture-stop')
    }
  }, [phase, deviceId])

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

  const primary = capturedInputs[0] ?? null
  const chordInputs: ChordInput[] = capturedInputs.slice(1).map((r) => ({
    type: r.type as 'button' | 'axis',
    button_id: r.button_id,
    button_name: r.button_name,
    axis_direction: r.type === 'axis' ? r.axis_direction : undefined,
  }))

  const isOverwrite = primary
    ? existingMappings.some((m) => {
        if (m.source_type !== primary.type) return false
        if (m.button_id !== primary.button_id) return false
        const newChordKey = chordInputs.map((c) => `${c.type}:${c.button_id}:${c.axis_direction ?? 0}`).sort().join('|')
        const existChordKey = (m.chord_inputs ?? []).map((c) => `${c.type}:${c.button_id}:${c.axis_direction ?? 0}`).sort().join('|')
        return newChordKey === existChordKey
      })
    : false

  const handleConfirm = () => {
    if (!primary || !keyCombo) return
    const mapping: Mapping = {
      button_id: primary.button_id,
      button_name: primary.button_name,
      key_combo: keyCombo,
      source_type: primary.type,
      axis_direction: primary.type !== 'button' ? primary.axis_direction : 0,
      axis_id_y: primary.type === 'diagonal' ? primary.axis_id_y : null,
      axis_direction_y: primary.type === 'diagonal' ? primary.axis_direction_y : 0,
      chord_inputs: chordInputs.length > 0 ? chordInputs : undefined,
    }
    onConfirm(mapping)
  }

  const retryCapture = () => {
    setCapturedInputs([])
    setKeyCombo(null)
    setPhase('chord-capture')
  }

  const retryKey = () => {
    setKeyCombo(null)
    setPhase('key')
  }

  const inputsLabel = capturedInputs.map((r) => r.button_name).join(' + ')

  return (
    <Modal title="Novo mapeamento" subtitle="Segure os botões do acorde e solte para capturar" onClose={onCancel}>
      <div className="flex gap-4 p-5">

        {/* Controller panel */}
        <div className="flex-1 card p-4 text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Controle</p>
          {phase === 'chord-capture' ? (
            <>
              <p className="text-sm text-slate-400 animate-pulse">Aguardando...</p>
              <p className="text-xs text-slate-400 mt-2">Segure os botões e solte</p>
            </>
          ) : (
            <>
              <button onClick={retryCapture} className="badge-ctrl text-sm px-3 py-1 cursor-pointer">
                {inputsLabel}
              </button>
              <p className="text-xs text-slate-400 mt-2">Clique para recapturar</p>
            </>
          )}
        </div>

        <div className="flex items-center text-slate-300 text-lg font-bold">──►</div>

        {/* Key panel */}
        <div className="flex-1 card p-4 text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Teclado</p>
          {phase === 'key' ? (
            <>
              <p className="text-sm text-slate-400 animate-pulse">Aguardando...</p>
              <p className="text-xs text-slate-400 mt-2">Pressione uma tecla ou atalho</p>
            </>
          ) : keyCombo ? (
            <>
              <button onClick={retryKey} className="badge-key text-sm px-3 py-1 cursor-pointer">
                {keyCombo}
              </button>
              <p className="text-xs text-slate-400 mt-2">Clique para substituir</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400">–</p>
              <p className="text-xs text-slate-400 mt-2">Aguardando controle primeiro</p>
            </>
          )}
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

