import { useEffect, useState } from 'react'
import type { ChordInput, CaptureResult, Mapping } from '../../../shared/models'
import Modal from './Modal'

interface Props {
  deviceId: number
  existingMappings: Mapping[]
  onConfirm: (mapping: Mapping) => void
  onCancel: () => void
  // When provided (from visual mapping view): skip chord-capture and use this as the primary input
  presetInput?: CaptureResult
  // Resolve profile display name for a captured input (button "A", axis "LS↑", etc.)
  resolveInputName?: (type: string, buttonId: number, axisDirection?: number) => string
}

// Capture phase state machine:
// - Normal flow:  chord-capture → key → ready
// - Preset flow:  key → ready  (chord-capture skipped)
type CapturePhase = 'chord-capture' | 'key' | 'ready'

export default function AddMappingDialog({ deviceId, existingMappings, onConfirm, onCancel, presetInput, resolveInputName }: Props) {
  const [phase, setPhase] = useState<CapturePhase>(presetInput ? 'key' : 'chord-capture')
  // When presetInput is given, it's the sole captured input (no chord)
  const [capturedInputs, setCapturedInputs] = useState<CaptureResult[]>(presetInput ? [presetInput] : [])
  const [keyCombo, setKeyCombo] = useState<string | null>(null)

  // Chord capture: accumulates all simultaneously held buttons; fires on release
  useEffect(() => {
    if (phase !== 'chord-capture') return
    window.api.invoke('controller:chord-capture-start', deviceId)
    const off = window.api.on('controller:chord-captured', (results) => {
      const enriched = resolveInputName
        ? results.map((r) => ({
            ...r,
            button_name: resolveInputName(r.type, r.button_id, r.type === 'axis' ? r.axis_direction : undefined),
          }))
        : results
      setCapturedInputs(enriched)
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

  // Build a canonical sorted key from ALL inputs (primary + extras) so that
  // X+Y and Y+X are treated as the same chord.
  const inputToken = (type: string, buttonId: number, axisDir: number) =>
    `${type}:${buttonId}:${axisDir}`

  const newInputKey = primary
    ? [
        inputToken(primary.type, primary.button_id, primary.axis_direction ?? 0),
        ...chordInputs.map((c) => inputToken(c.type, c.button_id, c.axis_direction ?? 0)),
      ]
        .sort()
        .join('|')
    : ''

  const isOverwrite = primary
    ? existingMappings.some((m) => {
        const existKey = [
          inputToken(m.source_type, m.button_id, m.axis_direction ?? 0),
          ...(m.chord_inputs ?? []).map((c) => inputToken(c.type, c.button_id, c.axis_direction ?? 0)),
        ]
          .sort()
          .join('|')
        return newInputKey === existKey
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
    if (presetInput) {
      // Preset flow: reset to key phase keeping the preset input
      setCapturedInputs([presetInput])
      setKeyCombo(null)
      setPhase('key')
    } else {
      setCapturedInputs([])
      setKeyCombo(null)
      setPhase('chord-capture')
    }
  }

  const retryKey = () => {
    setKeyCombo(null)
    setPhase('key')
  }

  const inputsLabel = capturedInputs.map((r) => r.button_name).join(' + ')

  return (
    <Modal title="Novo mapeamento" subtitle={presetInput ? `Mapeando: ${presetInput.button_name}` : 'Segure os botões do acorde e solte para capturar'} onClose={onCancel}>
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

