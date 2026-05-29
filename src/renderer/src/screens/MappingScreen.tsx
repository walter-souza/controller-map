import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeviceInfo, Mapping, RepeatSettings } from '../../../shared/models'
import AddMappingDialog from '../components/AddMappingDialog'
import DeleteConfirmDialog from '../components/DeleteConfirmDialog'
import SettingsDialog from '../components/SettingsDialog'

interface Props {
  device: DeviceInfo
  onBack: () => void
}

function sameKey(a: Mapping, b: Mapping): boolean {
  if (a.source_type !== b.source_type) return false
  if (a.button_id !== b.button_id) return false
  if (a.axis_direction !== b.axis_direction) return false
  if (a.source_type === 'diagonal') {
    return a.axis_id_y === b.axis_id_y && a.axis_direction_y === b.axis_direction_y
  }
  return true
}

export default function MappingScreen({ device, onBack }: Props) {
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [settings, setSettings] = useState<RepeatSettings>({ initial_delay_ms: 400, repeat_interval_ms: 50 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [pulse, setPulse] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const pulseRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load data on mount
  useEffect(() => {
    window.api.invoke('mappings:load', device.id).then(setMappings)
    window.api.invoke('settings:load').then(setSettings)
  }, [device.id])

  // Listen for disconnect event
  useEffect(() => {
    return window.api.on('mapper:disconnected', () => {
      setIsPlaying(false)
    })
  }, [])

  // Pulsing dot while active
  useEffect(() => {
    if (isPlaying) {
      pulseRef.current = setInterval(() => setPulse((p) => !p), 600)
    } else {
      if (pulseRef.current) clearInterval(pulseRef.current)
      setPulse(true)
    }
    return () => {
      if (pulseRef.current) clearInterval(pulseRef.current)
    }
  }, [isPlaying])

  const saveMappings = useCallback(
    (next: Mapping[]) => {
      setMappings(next)
      window.api.invoke('mappings:save', device.id, next)
    },
    [device.id],
  )

  const handlePlay = async () => {
    if (mappings.length === 0) return
    const ok = await window.api.invoke('mapper:start', device.id, mappings, settings)
    if (ok) setIsPlaying(true)
  }

  const handlePause = async () => {
    await window.api.invoke('mapper:stop')
    setIsPlaying(false)
  }

  const handleMappingAdded = (m: Mapping) => {
    const next = mappings.filter((x) => !sameKey(x, m)).concat(m)
    saveMappings(next)
  }

  const handleSettingsSaved = (s: RepeatSettings) => {
    setSettings(s)
    window.api.invoke('settings:save', s)
  }

  const confirmDelete = (index: number) => {
    const next = mappings.filter((_, i) => i !== index)
    saveMappings(next)
    setDeleteIndex(null)
  }

  const dotColor = isPlaying ? (pulse ? 'text-green-500' : 'text-green-700') : 'text-slate-300'
  const statusText = isPlaying ? 'Ativo' : 'Pausado'
  const statusTextColor = isPlaying ? 'text-green-600' : 'text-slate-400'

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-slate-800 px-6 py-3 flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-slate-400 hover:text-white text-xs mb-0.5 transition-colors">
            ← Voltar
          </button>
          <h1 className="text-white text-sm font-semibold">{device.name}</h1>
        </div>
        <button onClick={() => setShowSettings(true)} className="text-slate-400 hover:text-white text-lg transition-colors" title="Configurações">
          ⚙
        </button>
      </div>

      {/* Status bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className={`text-base leading-none ${dotColor}`}>●</span>
          <span className={`text-xs font-medium ${statusTextColor}`}>{statusText}</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowAdd(true)}
          disabled={isPlaying}
          className="btn-ctrl text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Adicionar
        </button>
        {isPlaying ? (
          <button onClick={handlePause} className="btn-danger text-xs">
            ⏸ Pausar
          </button>
        ) : (
          <button
            onClick={handlePlay}
            disabled={mappings.length === 0}
            className="btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ▶ Iniciar
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {mappings.length === 0 && (
          <div className="text-center mt-10">
            <p className="text-slate-400 text-sm">Nenhum mapeamento ainda.</p>
            <p className="text-slate-400 text-xs mt-1">Clique em "+ Adicionar" para começar.</p>
          </div>
        )}
        {mappings.map((m, i) => (
          <div key={i} className="card px-4 py-3 flex items-center gap-3">
            <span className="badge-ctrl">{m.button_name}</span>
            <span className="text-slate-300 text-sm">──►</span>
            <span className="badge-key">{m.key_combo}</span>
            <div className="flex-1" />
            <button
              onClick={() => setDeleteIndex(i)}
              className="btn-ghost text-red-400 hover:text-red-600 hover:bg-red-50 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Dialogs */}
      {showAdd && (
        <AddMappingDialog
          deviceId={device.id}
          existingMappings={mappings}
          onConfirm={(m) => {
            handleMappingAdded(m)
            setShowAdd(false)
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {deleteIndex !== null && (
        <DeleteConfirmDialog
          onConfirm={() => confirmDelete(deleteIndex)}
          onCancel={() => setDeleteIndex(null)}
        />
      )}
      {showSettings && (
        <SettingsDialog
          current={settings}
          onSave={(s) => {
            handleSettingsSaved(s)
            setShowSettings(false)
          }}
          onCancel={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
