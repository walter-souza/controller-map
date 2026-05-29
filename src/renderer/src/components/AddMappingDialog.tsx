import { useEffect, useState } from 'react'
import type { CaptureResult, Mapping } from '../../../shared/models'
import Modal from './Modal'

interface Props {
  deviceId: number
  existingMappings: Mapping[]
  onConfirm: (mapping: Mapping) => void
  onCancel: () => void
}

export default function AddMappingDialog({ deviceId, existingMappings, onConfirm, onCancel }: Props) {
  const [ctrlCapture, setCtrlCapture] = useState<CaptureResult | null>(null)
  const [keyCombo, setKeyCombo] = useState<string | null>(null)
  const [capturingCtrl, setCapturingCtrl] = useState(true)
  const [capturingKey, setCapturingKey] = useState(false)

  // Start controller capture immediately
  useEffect(() => {
    window.api.invoke('controller:capture-start', deviceId)
    const off = window.api.on('controller:button-captured', (result) => {
      setCtrlCapture(result)
      setCapturingCtrl(false)
      // Auto-start key capture
      window.api.invoke('keyboard:capture-start')
      setCapturingKey(true)
    })
    return () => {
      off()
      window.api.invoke('controller:capture-stop')
    }
  }, [deviceId])

  // Key capture listener
  useEffect(() => {
    if (!capturingKey) return
    const off = window.api.on('keyboard:key-captured', (combo) => {
      setKeyCombo(combo)
      setCapturingKey(false)
    })
    return () => {
      off()
      window.api.invoke('keyboard:capture-stop')
    }
  }, [capturingKey])

  const isOverwrite = ctrlCapture
    ? existingMappings.some((m) => {
        if (m.source_type !== ctrlCapture.type) return false
        if (m.button_id !== ctrlCapture.button_id) return false
        if (ctrlCapture.type === 'axis' && m.axis_direction !== ctrlCapture.axis_direction) return false
        if (ctrlCapture.type === 'diagonal') {
          return (
            m.axis_direction === ctrlCapture.axis_direction &&
            m.axis_id_y === ctrlCapture.axis_id_y &&
            m.axis_direction_y === ctrlCapture.axis_direction_y
          )
        }
        return true
      })
    : false

  const canConfirm = ctrlCapture !== null && keyCombo !== null

  const handleConfirm = () => {
    if (!ctrlCapture || !keyCombo) return
    const mapping: Mapping = {
      button_id: ctrlCapture.button_id,
      button_name: ctrlCapture.button_name,
      key_combo: keyCombo,
      source_type: ctrlCapture.type,
      axis_direction: ctrlCapture.type !== 'button' ? ctrlCapture.axis_direction : 0,
      axis_id_y: ctrlCapture.type === 'diagonal' ? ctrlCapture.axis_id_y : null,
      axis_direction_y: ctrlCapture.type === 'diagonal' ? ctrlCapture.axis_direction_y : 0,
    }
    onConfirm(mapping)
  }

  const recaptureCtrl = () => {
    setCtrlCapture(null)
    setKeyCombo(null)
    setCapturingCtrl(true)
    setCapturingKey(false)
    window.api.invoke('controller:capture-start', deviceId)
  }

  const recaptureKey = () => {
    setKeyCombo(null)
    setCapturingKey(true)
    window.api.invoke('keyboard:capture-start')
  }

  return (
    <Modal title="Novo mapeamento" subtitle="Pressione um botão no controle e uma tecla no teclado" onClose={onCancel}>
      <div className="flex gap-4 p-5">
        {/* Controller panel */}
        <div className="flex-1 card p-4 text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Controle</p>
          {capturingCtrl ? (
            <p className="text-sm text-slate-400 animate-pulse">Aguardando...</p>
          ) : (
            <button onClick={recaptureCtrl} className="badge-ctrl text-sm px-3 py-1 cursor-pointer">
              {ctrlCapture?.button_name}
            </button>
          )}
          <p className="text-xs text-slate-400 mt-2">
            {capturingCtrl ? 'Pressione um botão ou mova um eixo' : 'Clique para substituir'}
          </p>
        </div>

        <div className="flex items-center text-slate-300 text-lg font-bold">──►</div>

        {/* Key panel */}
        <div className="flex-1 card p-4 text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Teclado</p>
          {capturingKey ? (
            <p className="text-sm text-slate-400 animate-pulse">Aguardando...</p>
          ) : keyCombo ? (
            <button onClick={recaptureKey} className="badge-key text-sm px-3 py-1 cursor-pointer">
              {keyCombo}
            </button>
          ) : (
            <p className="text-sm text-slate-400">–</p>
          )}
          <p className="text-xs text-slate-400 mt-2">
            {capturingKey ? 'Pressione uma tecla ou atalho' : keyCombo ? 'Clique para substituir' : 'Aguardando controle primeiro'}
          </p>
        </div>
      </div>

      {isOverwrite && (
        <p className="text-xs text-amber-600 px-5 pb-1">⚠ Este botão já está mapeado — confirmar irá sobrescrever</p>
      )}

      <div className="border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button onClick={handleConfirm} disabled={!canConfirm} className="btn-primary">
          Confirmar
        </button>
      </div>
    </Modal>
  )
}
