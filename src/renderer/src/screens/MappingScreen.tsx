import { useCallback, useEffect, useRef, useState } from 'react'
import type { AngleMappingConfig, CaptureResult, DeviceInfo, Mapping, RepeatSettings } from '../../../shared/models'
import AddMappingDialog from '../components/AddMappingDialog'
import AngleMappingDialog from '../components/AngleMappingDialog'
import DeleteConfirmDialog from '../components/DeleteConfirmDialog'
import SettingsDialog from '../components/SettingsDialog'
import VisualMappingView from '../components/VisualMappingView'
import { detectProfile } from '../data/profiles'
import type { ControllerProfile } from '../../../shared/models'

interface Props {
  device: DeviceInfo
  onBack: () => void
}

// Returns a canonical identity string for a mapping (all inputs as sorted set)
function mappingInputKey(m: Mapping): string {
  const primary = `${m.source_type}:${m.button_id}:${m.axis_direction}`
  const extras = (m.chord_inputs ?? [])
    .map((c) => `${c.type}:${c.button_id}:${c.axis_direction ?? 0}`)
    .sort()
  return [primary, ...extras].sort().join('|')
}

function sameKey(a: Mapping, b: Mapping): boolean {
  return mappingInputKey(a) === mappingInputKey(b)
}

function controlLabel(m: Mapping): string {
  const parts = [m.button_name, ...(m.chord_inputs ?? []).map((c) => c.button_name)]
  return parts.join(' + ')
}

export default function MappingScreen({ device, onBack }: Props) {
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [angleMappings, setAngleMappings] = useState<AngleMappingConfig[]>([])
  const [settings, setSettings] = useState<RepeatSettings>({ initial_delay_ms: 400, repeat_interval_ms: 50 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [pulse, setPulse] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addPreset, setAddPreset] = useState<CaptureResult | undefined>(undefined)
  const [showAngleAdd, setShowAngleAdd] = useState(false)
  const [editingAngle, setEditingAngle] = useState<AngleMappingConfig | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [deleteAngleId, setDeleteAngleId] = useState<string | null>(null)
  const pulseRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Profile detection: auto-identify known controllers by device name
  const profile: ControllerProfile | null = detectProfile(device.name)
  const [viewMode, setViewMode] = useState<'visual' | 'list'>(profile ? 'visual' : 'list')
  const [activeInputs, setActiveInputs] = useState<Set<string>>(new Set())
  // Raw axis values for smooth joystick pad visualization (dot position)
  const [axisValues, setAxisValues] = useState<Record<number, number>>({})
  // Ref + RAF for throttling axisValues state updates to 60fps
  const axisValuesRef = useRef<Record<number, number>>({})
  const axisRafRef = useRef<number | null>(null)

  // Real-time input monitor — active when visual view is visible
  useEffect(() => {
    if (!profile || viewMode !== 'visual') {
      setActiveInputs(new Set())
      setAxisValues({})
      axisValuesRef.current = {}
      return
    }
    window.api.invoke('controller:monitor-start', device.id)
    const offDown = window.api.on('controller:button-down', ({ button }) => {
      setActiveInputs((prev) => new Set([...prev, `b:${button}`]))
    })
    const offUp = window.api.on('controller:button-up', ({ button }) => {
      setActiveInputs((prev) => { const s = new Set(prev); s.delete(`b:${button}`); return s })
    })
    const offAxis = window.api.on('controller:axis-motion', ({ axis, value }) => {
      const THRESHOLD = 0.5
      // Threshold-based activeInputs (drives sector highlight + guide line highlight)
      setActiveInputs((prev) => {
        const s = new Set(prev)
        s.delete(`a:${axis}:1`)
        s.delete(`a:${axis}:-1`)
        if (value > THRESHOLD) s.add(`a:${axis}:1`)
        else if (value < -THRESHOLD) s.add(`a:${axis}:-1`)
        return s
      })
      // Raw axis values via RAF-throttled state update (drives dot position)
      axisValuesRef.current = { ...axisValuesRef.current, [axis]: value }
      if (!axisRafRef.current) {
        axisRafRef.current = requestAnimationFrame(() => {
          setAxisValues({ ...axisValuesRef.current })
          axisRafRef.current = null
        })
      }
    })
    return () => {
      offDown(); offUp(); offAxis()
      if (axisRafRef.current) cancelAnimationFrame(axisRafRef.current)
      axisRafRef.current = null
      window.api.invoke('controller:monitor-stop')
      setActiveInputs(new Set())
      setAxisValues({})
      axisValuesRef.current = {}
    }
  }, [profile, viewMode, device.id])

  // Load data on mount
  useEffect(() => {
    window.api.invoke('mappings:load', device.id).then(setMappings)
    window.api.invoke('angle-mappings:load', device.id).then(setAngleMappings)
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

  const saveAngleMappings = useCallback(
    (next: AngleMappingConfig[]) => {
      setAngleMappings(next)
      window.api.invoke('angle-mappings:save', device.id, next)
    },
    [device.id],
  )

  const handlePlay = async () => {
    if (mappings.length === 0 && angleMappings.length === 0) return
    const ok = await window.api.invoke('mapper:start', device.id, mappings, settings, angleMappings)
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

  const openAddWithPreset = (preset: CaptureResult) => {
    setAddPreset(preset)
    setShowAdd(true)
  }

  const openAddFreeCapture = () => {
    setAddPreset(undefined)
    setShowAdd(true)
  }

  const handleDeleteMapping = (m: Mapping) => {
    const idx = mappings.findIndex((x) => sameKey(x, m))
    if (idx !== -1) setDeleteIndex(idx)
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

  const handleAngleSaved = (cfg: AngleMappingConfig) => {
    const next = angleMappings.some((a) => a.id === cfg.id)
      ? angleMappings.map((a) => (a.id === cfg.id ? cfg : a))
      : [...angleMappings, cfg]
    saveAngleMappings(next)
    setShowAngleAdd(false)
    setEditingAngle(null)
  }

  const confirmDeleteAngle = (id: string) => {
    saveAngleMappings(angleMappings.filter((a) => a.id !== id))
    setDeleteAngleId(null)
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
        {/* View mode toggle — only when profile detected */}
        {profile && (
          <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs">
            <button
              onClick={() => setViewMode('visual')}
              className={`px-3 py-1 transition-colors ${viewMode === 'visual' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              🎮 Visual
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 transition-colors ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              ☰ Lista
            </button>
          </div>
        )}
        <button
          onClick={openAddFreeCapture}
          disabled={isPlaying}
          className="btn-ctrl text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Botão
        </button>
        <button
          onClick={() => setShowAngleAdd(true)}
          disabled={isPlaying}
          className="btn-ctrl text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ⊕ Ângulo
        </button>
        {isPlaying ? (
          <button onClick={handlePause} className="btn-danger text-xs">
            ⏸ Pausar
          </button>
        ) : (
          <button
            onClick={handlePlay}
            disabled={mappings.length === 0 && angleMappings.length === 0}
            className="btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ▶ Iniciar
          </button>
        )}
      </div>

      {/* Main content: visual or list view */}
      {profile && viewMode === 'visual' ? (
        <VisualMappingView
          profile={profile}
          mappings={mappings}
          angleMappings={angleMappings}
          isPlaying={isPlaying}
          activeInputs={activeInputs}
          axisValues={axisValues}
          onAddMapping={openAddWithPreset}
          onDeleteMapping={handleDeleteMapping}
          onEditAngleMapping={(stick) => {
            const existing = angleMappings.find(
              (a) => a.axis_x === stick.axis_x && a.axis_y === stick.axis_y
            )
            setEditingAngle(existing ?? {
              id: crypto.randomUUID(),
              axis_x: stick.axis_x,
              axis_y: stick.axis_y,
              deadzone: 0.2,
              nodes: [
                { id: crypto.randomUUID(), angle: 45 },
                { id: crypto.randomUUID(), angle: 135 },
                { id: crypto.randomUUID(), angle: 225 },
                { id: crypto.randomUUID(), angle: 315 },
              ],
              regions: [
                { id: crypto.randomUUID(), key_combo: '' },
                { id: crypto.randomUUID(), key_combo: '' },
                { id: crypto.randomUUID(), key_combo: '' },
                { id: crypto.randomUUID(), key_combo: '' },
              ],
            })
          }}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {mappings.length === 0 && angleMappings.length === 0 && (
          <div className="text-center mt-10">
            <p className="text-slate-400 text-sm">Nenhum mapeamento ainda.</p>
            <p className="text-slate-400 text-xs mt-1">Clique em "+ Botão" ou "⊕ Ângulo" para começar.</p>
          </div>
        )}
        {mappings.map((m, i) => (
          <div key={i} className="card px-4 py-3 flex items-center gap-3">
            <span className="badge-ctrl">{controlLabel(m)}</span>
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

        {/* Angle mapping cards */}
        {angleMappings.length > 0 && (
          <>
            {mappings.length > 0 && <div className="border-t border-slate-100 my-1" />}
            {angleMappings.map((cfg) => (
              <div key={cfg.id} className="card px-4 py-3 flex items-center gap-3">
                <span className="text-lg leading-none">🕹</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-700">
                    Eixo {cfg.axis_x} × Eixo {cfg.axis_y}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {cfg.regions.map((r) => r.key_combo || '?').join(' / ')}
                    <span className="ml-1 text-slate-300">· {cfg.regions.length} regiões</span>
                  </div>
                </div>
                <button
                  onClick={() => setEditingAngle(cfg)}
                  disabled={isPlaying}
                  className="btn-ghost text-xs disabled:opacity-40"
                >
                  ✎
                </button>
                <button
                  onClick={() => setDeleteAngleId(cfg.id)}
                  className="btn-ghost text-red-400 hover:text-red-600 hover:bg-red-50 text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </>
        )}
        </div>
      )}

      {/* Dialogs */}
      {showAdd && (
        <AddMappingDialog
          deviceId={device.id}
          existingMappings={mappings}
          presetInput={addPreset}
          onConfirm={(m) => {
            handleMappingAdded(m)
            setShowAdd(false)
            setAddPreset(undefined)
          }}
          onCancel={() => {
            setShowAdd(false)
            setAddPreset(undefined)
          }}
        />
      )}
      {(showAngleAdd || editingAngle) && (
        <AngleMappingDialog
          initial={editingAngle ?? undefined}
          onConfirm={handleAngleSaved}
          onCancel={() => { setShowAngleAdd(false); setEditingAngle(null) }}
        />
      )}
      {deleteIndex !== null && (
        <DeleteConfirmDialog
          onConfirm={() => confirmDelete(deleteIndex)}
          onCancel={() => setDeleteIndex(null)}
        />
      )}
      {deleteAngleId !== null && (
        <DeleteConfirmDialog
          onConfirm={() => confirmDeleteAngle(deleteAngleId)}
          onCancel={() => setDeleteAngleId(null)}
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
