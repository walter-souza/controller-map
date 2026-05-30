import { useCallback, useEffect, useRef, useState } from 'react'
import type { AngleMappingConfig, CaptureResult, DeviceInfo, Mapping, MappingProfile, RepeatSettings } from '../../../shared/models'
import AddMappingDialog from '../components/AddMappingDialog'
import AngleMappingDialog from '../components/AngleMappingDialog'
import DeleteConfirmDialog from '../components/DeleteConfirmDialog'
import ProfileNameDialog from '../components/ProfileNameDialog'
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

function resolveButtonName(
  profile: ControllerProfile,
  sourceType: string,
  buttonId: number,
  axisDirection?: number,
): string {
  const input = profile.inputs.find((i) => {
    if (sourceType === 'button' && i.type === 'button') return i.id === buttonId
    if (i.type === 'axis') return i.axis_id === buttonId && i.direction === axisDirection
    return false
  })
  return input?.name ?? (sourceType === 'button' ? `Botão ${buttonId}` : `Eixo ${buttonId}`)
}

function controlLabel(m: Mapping, profile: ControllerProfile): string {
  const primary = resolveButtonName(profile, m.source_type, m.button_id, m.axis_direction || undefined)
  const extras = (m.chord_inputs ?? []).map((c) =>
    resolveButtonName(profile, c.type, c.button_id, c.axis_direction),
  )
  return [primary, ...extras].join(' + ')
}

export default function MappingScreen({ device, onBack }: Props) {
  // ── Profile state ───────────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<MappingProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string>('')
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showProfileCreate, setShowProfileCreate] = useState(false)
  const [renameProfile, setRenameProfile] = useState<MappingProfile | null>(null)
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null)

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null
  const mappings: Mapping[] = activeProfile?.mappings ?? []
  const angleMappings: AngleMappingConfig[] = activeProfile?.angleMappings ?? []

  // ── Other state ─────────────────────────────────────────────────────────────
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
  const controllerProfile: ControllerProfile | null = detectProfile(device.name)
  const [viewMode, setViewMode] = useState<'visual' | 'list'>(controllerProfile ? 'visual' : 'list')
  const [activeInputs, setActiveInputs] = useState<Set<string>>(new Set())
  // Raw axis values for smooth joystick pad visualization (dot position)
  const [axisValues, setAxisValues] = useState<Record<number, number>>({})
  // Ref + RAF for throttling axisValues state updates to 60fps
  const axisValuesRef = useRef<Record<number, number>>({})
  const axisRafRef = useRef<number | null>(null)

  // Real-time input monitor — active when visual view is visible
  useEffect(() => {
    if (!controllerProfile || viewMode !== 'visual') {
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
  }, [controllerProfile, viewMode, device.id])

  // Load profiles + settings on mount
  useEffect(() => {
    window.api.invoke('profiles:load-all').then(({ profiles: p, activeProfileId: id }) => {
      setProfiles(p)
      setActiveProfileId(id)
    })
    window.api.invoke('settings:load').then(setSettings)
  }, [])

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

  // ── Profile persistence helpers ─────────────────────────────────────────────

  const updateActiveProfile = useCallback(
    (updater: (p: MappingProfile) => MappingProfile) => {
      if (!activeProfile) return
      const updated = updater(activeProfile)
      const nextProfiles = profiles.map((p) => (p.id === updated.id ? updated : p))
      setProfiles(nextProfiles)
      window.api.invoke('profiles:update', updated)
    },
    [activeProfile, profiles],
  )

  const saveMappings = useCallback(
    (next: Mapping[]) => {
      updateActiveProfile((p) => ({ ...p, mappings: next }))
    },
    [updateActiveProfile],
  )

  const saveAngleMappings = useCallback(
    (next: AngleMappingConfig[]) => {
      updateActiveProfile((p) => ({ ...p, angleMappings: next }))
    },
    [updateActiveProfile],
  )

  // ── Profile actions ─────────────────────────────────────────────────────────

  const switchProfile = async (id: string) => {
    await window.api.invoke('profiles:set-active', id)
    setActiveProfileId(id)
    setShowProfileMenu(false)
    if (isPlaying) {
      await window.api.invoke('mapper:stop')
      setIsPlaying(false)
    }
  }

  const createProfile = async (name: string) => {
    const result = await window.api.invoke('profiles:create', name)
    setProfiles(result.profiles)
    setActiveProfileId(result.activeProfileId)
    setShowProfileCreate(false)
  }

  const renameActiveProfile = async (name: string) => {
    if (!renameProfile) return
    const updated = { ...renameProfile, name }
    const nextProfiles = profiles.map((p) => (p.id === updated.id ? updated : p))
    setProfiles(nextProfiles)
    window.api.invoke('profiles:update', updated)
    setRenameProfile(null)
  }

  const handleDeleteProfile = async (id: string) => {
    const result = await window.api.invoke('profiles:delete', id)
    setProfiles(result.profiles)
    setActiveProfileId(result.activeProfileId)
    setDeleteProfileId(null)
    if (isPlaying) {
      await window.api.invoke('mapper:stop')
      setIsPlaying(false)
    }
  }

  const handleExportProfile = async () => {
    if (activeProfile) {
      await window.api.invoke('profiles:export', activeProfile.id)
      setShowProfileMenu(false)
    }
  }

  const handleImportProfile = async () => {
    const imported = await window.api.invoke('profiles:import')
    if (imported) {
      setProfiles((prev) => [...prev, imported])
    }
    setShowProfileMenu(false)
  }

  // ── Mapping actions ─────────────────────────────────────────────────────────

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

      {/* Profile bar */}
      <div className="bg-slate-700 px-6 py-2 flex items-center gap-3 relative">
        <span className="text-slate-400 text-xs font-medium">Perfil:</span>
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu((v) => !v)}
            className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs px-3 py-1.5 rounded-md transition-colors min-w-[140px] justify-between"
          >
            <span className="truncate max-w-[120px]">{activeProfile?.name ?? '…'}</span>
            <span className="text-slate-300">▾</span>
          </button>
          {showProfileMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[220px]">
              {/* Profile list */}
              <div className="py-1 border-b border-slate-100">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => switchProfile(p.id)}
                    className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 hover:bg-slate-50 transition-colors ${p.id === activeProfileId ? 'font-semibold text-blue-600' : 'text-slate-700'}`}
                  >
                    {p.id === activeProfileId && <span>✓</span>}
                    {p.id !== activeProfileId && <span className="w-3" />}
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
              {/* Actions */}
              <div className="py-1 border-b border-slate-100">
                <button
                  onClick={() => { setShowProfileMenu(false); setShowProfileCreate(true) }}
                  className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  ＋ Novo perfil
                </button>
                {activeProfile && (
                  <button
                    onClick={() => { setShowProfileMenu(false); setRenameProfile(activeProfile) }}
                    className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    ✎ Renomear perfil
                  </button>
                )}
                {activeProfile && profiles.length > 1 && (
                  <button
                    onClick={() => { setShowProfileMenu(false); setDeleteProfileId(activeProfile.id) }}
                    className="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors"
                  >
                    ✕ Excluir perfil
                  </button>
                )}
              </div>
              {/* Import / Export */}
              <div className="py-1">
                <button
                  onClick={handleExportProfile}
                  className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  ↓ Exportar perfil
                </button>
                <button
                  onClick={handleImportProfile}
                  className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  ↑ Importar perfil
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Close profile menu on outside click */}
        {showProfileMenu && (
          <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
        )}
      </div>

      {/* Status bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className={`text-base leading-none ${dotColor}`}>●</span>
          <span className={`text-xs font-medium ${statusTextColor}`}>{statusText}</span>
        </div>
        <div className="flex-1" />
        {/* View mode toggle — only when controller profile detected */}
        {controllerProfile && (
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
      {controllerProfile && viewMode === 'visual' ? (
        <VisualMappingView
          profile={controllerProfile}
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
            <span className="badge-ctrl">{controlLabel(m, profile)}</span>
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
          resolveInputName={(type, buttonId, axisDirection) =>
            resolveButtonName(profile, type, buttonId, axisDirection)
          }
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
      {deleteProfileId !== null && (
        <DeleteConfirmDialog
          onConfirm={() => handleDeleteProfile(deleteProfileId)}
          onCancel={() => setDeleteProfileId(null)}
        />
      )}
      {showProfileCreate && (
        <ProfileNameDialog
          mode="create"
          onConfirm={createProfile}
          onCancel={() => setShowProfileCreate(false)}
        />
      )}
      {renameProfile && (
        <ProfileNameDialog
          mode="rename"
          initialName={renameProfile.name}
          onConfirm={renameActiveProfile}
          onCancel={() => setRenameProfile(null)}
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

