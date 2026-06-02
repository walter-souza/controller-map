import { useEffect, useState } from 'react'
import type { AngleMappingConfig, Mapping } from '../../../shared/models'
import Modal from './Modal'
import AngleMappingEditor from './AngleMappingEditor'

interface Props {
  initial?: AngleMappingConfig
  defaultAxisX?: number
  defaultAxisY?: number
  existingMappings?: Mapping[]
  existingAngleMappings?: AngleMappingConfig[]
  onConfirm: (config: AngleMappingConfig) => void
  onCancel: () => void
}

const COLORS = [
  '#ef4444', '#22c55e', '#3b82f6', '#f97316',
  '#a855f7', '#06b6d4', '#ec4899', '#84cc16',
]

type Preset = '4-wasd' | '4-arrows' | '8-wasd-diag' | '8-wasd-chords' | 'custom'

function makeNodes(angles: number[]) {
  return angles.map((angle) => ({ id: crypto.randomUUID(), angle }))
}

function makeRegions(combos: string[]) {
  return combos.map((key_combo) => ({ id: crypto.randomUUID(), key_combos: [key_combo] }))
}

function createFromPreset(preset: Preset, existingId?: string): AngleMappingConfig {
  const id = existingId ?? crypto.randomUUID()
  const base = { id, axis_x: 0, axis_y: 1, deadzone: 0.2 }

  if (preset === '4-wasd') {
    return {
      ...base,
      nodes: makeNodes([45, 135, 225, 315]),
      regions: makeRegions(['w', 'a', 's', 'd']),
    }
  }

  if (preset === '4-arrows') {
    return {
      ...base,
      nodes: makeNodes([45, 135, 225, 315]),
      regions: makeRegions(['up', 'left', 'down', 'right']),
    }
  }

  if (preset === '8-wasd-diag') {
    return {
      ...base,
      nodes: makeNodes([22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]),
      regions: makeRegions(['e', 'w', 'q', 'a', 'z', 's', 'c', 'd']),
    }
  }

  if (preset === '8-wasd-chords') {
    return {
      ...base,
      nodes: makeNodes([22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]),
      regions: makeRegions(['w+d', 'w', 'w+a', 'a', 'a+s', 's', 's+d', 'd']),
    }
  }

  return {
    ...base,
    nodes: makeNodes([0]),
    regions: makeRegions(['']),
  }
}

function detectPreset(cfg: AngleMappingConfig): Preset {
  const combos = cfg.regions.map((r) => r.key_combos[0] ?? '').join(',')
  if (combos === 'w,a,s,d') return '4-wasd'
  if (combos === 'up,left,down,right') return '4-arrows'
  if (combos === 'e,w,q,a,z,s,c,d') return '8-wasd-diag'
  if (combos === 'w+d,w,w+a,a,a+s,s,s+d,d') return '8-wasd-chords'
  return 'custom'
}

export default function AngleMappingDialog({
  initial,
  defaultAxisX,
  defaultAxisY,
  existingMappings,
  existingAngleMappings,
  onConfirm,
  onCancel
}: Props) {
  const [config, setConfig] = useState<AngleMappingConfig>(() => {
    if (initial) {
      return {
        ...initial,
        regions: initial.regions.map(r => ({
          ...r,
          allow_combination: r.allow_combination ?? (r.isolate_modifiers !== undefined ? !r.isolate_modifiers : false)
        }))
      }
    }
    const cfg = createFromPreset('4-wasd')
    return {
      ...cfg,
      axis_x: defaultAxisX ?? cfg.axis_x,
      axis_y: defaultAxisY ?? cfg.axis_y,
    }
  })
  const [preset, setPreset] = useState<Preset>(initial ? detectPreset(initial) : '4-wasd')
  const [capturingIdx, setCapturingIdx] = useState<number | null>(null)

  const applyPreset = (p: Preset) => {
    setPreset(p)
    if (p !== 'custom') {
      setConfig((prev) => {
        const nextCfg = createFromPreset(p, prev.id)
        const checked = prev.regions.every((r) => r.allow_combination)
        return {
          ...prev,
          nodes: nextCfg.nodes,
          regions: nextCfg.regions.map((r) => ({
            ...r,
            allow_combination: checked,
            isolate_modifiers: !checked,
          })),
        }
      })
    }
  }
  
  // Real-time axis detection state (tracks which axis is actively being listened to)
  const [detectingAxis, setDetectingAxis] = useState<'x' | 'y' | null>(null)

  // Real-time axis motion values for active joystick position dot indicator
  const [axisValues, setAxisValues] = useState<Record<number, number>>({})

  // Keyboard capture for a specific region
  useEffect(() => {
    if (capturingIdx === null) return

    window.api.invoke('keyboard:capture-start')

    const off = window.api.on('keyboard:key-captured', (combo) => {
      window.api.invoke('keyboard:capture-stop')
      setConfig((prev) => {
        const newRegions = prev.regions.map((r, i) =>
          i === capturingIdx ? { ...r, key_combos: [combo] } : r,
        )
        return { ...prev, regions: newRegions }
      })
      setCapturingIdx(null)
    })

    return () => {
      off()
      window.api.invoke('keyboard:capture-stop')
    }
  }, [capturingIdx])

  // Real-time controller isolated axis auto-detection
  useEffect(() => {
    if (detectingAxis === null) return

    const offAxis = window.api.on('controller:axis-motion', ({ axis, value }) => {
      const THRESHOLD = 0.35
      if (Math.abs(value) > THRESHOLD) {
        setConfig((prev) => {
          if (detectingAxis === 'x') {
            return { ...prev, axis_x: axis }
          } else {
            return { ...prev, axis_y: axis }
          }
        })
        setDetectingAxis(null) // Stop detecting immediately after capturing an input
      }
    })

    return () => {
      offAxis()
    }
  }, [detectingAxis])

  // Live controller axis motion values tracker
  useEffect(() => {
    const offAxis = window.api.on('controller:axis-motion', ({ axis, value }) => {
      setAxisValues((prev) => ({ ...prev, [axis]: value }))
    })

    return () => {
      offAxis()
    }
  }, [])

  const addRegion = () => {
    setPreset('custom')
    const n = config.nodes.length
    if (n === 0) {
      setConfig((prev) => ({
        ...prev,
        nodes: [{ id: crypto.randomUUID(), angle: 0 }],
        regions: [{ id: crypto.randomUUID(), key_combos: [] }],
      }))
      return
    }

    // Find largest arc to split
    let maxSpan = 0
    let maxIdx = 0
    for (let i = 0; i < n; i++) {
      const start = config.nodes[i].angle
      const end = config.nodes[(i + 1) % n].angle
      const span = (end - start + 360) % 360
      if (span > maxSpan) {
        maxSpan = span
        maxIdx = i
      }
    }

    const startAngle = config.nodes[maxIdx].angle
    const midAngle = (startAngle + maxSpan / 2) % 360

    const newNodes = [...config.nodes]
    const newRegions = [...config.regions]
    newNodes.splice(maxIdx + 1, 0, { id: crypto.randomUUID(), angle: midAngle })
    newRegions.splice(maxIdx + 1, 0, { id: crypto.randomUUID(), key_combos: [] })

    setConfig((prev) => ({ ...prev, nodes: newNodes, regions: newRegions }))
  }

  const removeRegion = (idx: number) => {
    if (config.nodes.length <= 1) return
    setPreset('custom')
    const newNodes = config.nodes.filter((_, i) => i !== idx)
    const newRegions = config.regions.filter((_, i) => i !== idx)
    setConfig((prev) => ({ ...prev, nodes: newNodes, regions: newRegions }))
  }

  const isAxisMappedSomewhere = (axisChannel: number) => {
    const hasStandardMapping = (existingMappings ?? []).some(
      (m) => m.source_type === 'axis' && m.button_id === axisChannel
    )
    const hasOtherAngleMapping = (existingAngleMappings ?? []).some(
      (a) => a.id !== config.id && (a.axis_x === axisChannel || a.axis_y === axisChannel)
    )
    return hasStandardMapping || hasOtherAngleMapping
  }

  const isAxisXAlreadyMapped = isAxisMappedSomewhere(config.axis_x)
  const isAxisYAlreadyMapped = isAxisMappedSomewhere(config.axis_y)

  const canSave = config.nodes.length >= 1 && config.regions.some((r) => r.key_combos.some((k) => k.trim()))

  return (
    <Modal title="Mapeamento por Ângulo" onClose={onCancel} widthClassName="max-w-[760px]">
      <div className="flex flex-col bg-slate-50 text-slate-800 select-none">
        
        {/* Main horizontal layout columns */}
        <div className="flex flex-col md:flex-row gap-6 p-6 min-h-0 items-stretch">
          
          {/* Column 1: Hero Visual Editor (Click to map area) */}
          <div className="flex-1 flex flex-col gap-4 items-center justify-start relative min-w-0">
            {/* Eixos do Controle Selector Panel */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2 w-full max-w-[390px]">
              <div className="flex justify-between items-center px-0.5">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-0.5">Eixos do Controle</span>
                <span className="text-[9px] text-slate-400 font-medium">Selecione e mova o analógico</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-0.5">
                {/* Axis X */}
                <div className="relative">
                  <button
                    onClick={() => setDetectingAxis(detectingAxis === 'x' ? null : 'x')}
                    className={`flex items-center justify-between border rounded-lg px-2.5 py-2 shadow-sm transition-all duration-250 w-full cursor-pointer ${
                      detectingAxis === 'x'
                        ? 'border-amber-400 bg-amber-50 shadow-[0_0_8px_rgba(245,158,11,0.06)]'
                        : isAxisXAlreadyMapped
                        ? 'border-amber-300 bg-amber-50/20 hover:border-amber-400 hover:bg-amber-50/40 shadow-[0_0_6px_rgba(245,158,11,0.02)]'
                        : 'border-slate-200 bg-white hover:bg-slate-100 hover:border-slate-300'
                    }`}
                    title="Clique e mova um analógico no controle para mapear o Eixo X"
                  >
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Eixo X</span>
                    {detectingAxis === 'x' ? (
                      <span className="text-[10px] font-bold text-amber-600 animate-pulse">Mova...</span>
                    ) : (
                      <span className="text-xs font-mono font-black text-slate-700">Canal {config.axis_x}</span>
                    )}
                  </button>
                  {isAxisXAlreadyMapped && detectingAxis !== 'x' && (
                    <div className="absolute -top-1.5 -left-1.5 group z-30 animate-fade-in">
                      <div
                        className="bg-amber-500 border border-white text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] cursor-help shadow-md select-none font-black"
                      >
                        !
                      </div>
                      {/* Custom Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 delay-75 pointer-events-none z-40">
                        <div className="relative bg-slate-900/95 text-white text-[9px] font-extrabold px-2.5 py-1 rounded-md shadow-lg shadow-slate-950/25 whitespace-nowrap leading-tight border border-slate-800 text-center">
                          Canal já possui mapeamentos ativos
                          {/* Arrow */}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 -translate-y-[3px] w-1.5 h-1.5 bg-slate-900 border-r border-b border-slate-800 rotate-45" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Axis Y */}
                <div className="relative">
                  <button
                    onClick={() => setDetectingAxis(detectingAxis === 'y' ? null : 'y')}
                    className={`flex items-center justify-between border rounded-lg px-2.5 py-2 shadow-sm transition-all duration-250 w-full cursor-pointer ${
                      detectingAxis === 'y'
                        ? 'border-amber-400 bg-amber-50 shadow-[0_0_8px_rgba(245,158,11,0.06)]'
                        : isAxisYAlreadyMapped
                        ? 'border-amber-300 bg-amber-50/20 hover:border-amber-400 hover:bg-amber-50/40 shadow-[0_0_6px_rgba(245,158,11,0.02)]'
                        : 'border-slate-200 bg-white hover:bg-slate-100 hover:border-slate-300'
                    }`}
                    title="Clique e mova um analógico no controle para mapear o Eixo Y"
                  >
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Eixo Y</span>
                    {detectingAxis === 'y' ? (
                      <span className="text-[10px] font-bold text-amber-600 animate-pulse">Mova...</span>
                    ) : (
                      <span className="text-xs font-mono font-black text-slate-700">Canal {config.axis_y}</span>
                    )}
                  </button>
                  {isAxisYAlreadyMapped && detectingAxis !== 'y' && (
                    <div className="absolute -top-1.5 -left-1.5 group z-30 animate-fade-in">
                      <div
                        className="bg-amber-500 border border-white text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] cursor-help shadow-md select-none font-black"
                      >
                        !
                      </div>
                      {/* Custom Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 delay-75 pointer-events-none z-40">
                        <div className="relative bg-slate-900/95 text-white text-[9px] font-extrabold px-2.5 py-1 rounded-md shadow-lg shadow-slate-950/25 whitespace-nowrap leading-tight border border-slate-800 text-center">
                          Canal já possui mapeamentos ativos
                          {/* Arrow */}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 -translate-y-[3px] w-1.5 h-1.5 bg-slate-900 border-r border-b border-slate-800 rotate-45" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Visual Editor container with absolute capturing overlay inside */}
            <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm flex items-center justify-center relative overflow-hidden w-full max-w-[390px] flex-1">
              <div className="relative z-10 flex items-center justify-center w-full h-full">
                <AngleMappingEditor
                  config={config}
                  onChange={setConfig}
                  onSelectRegion={setCapturingIdx}
                  axisXVal={axisValues[config.axis_x] ?? 0}
                  axisYVal={axisValues[config.axis_y] ?? 0}
                />
              </div>

              {/* Ultra-premium blur overlay when actively capturing keyboard input */}
              {capturingIdx !== null && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20 animate-fade-in transition-all">
                  {/* Glowing pulsing circle in the color of the region */}
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center border-2 border-amber-500 animate-pulse relative"
                    style={{
                      boxShadow: '0 0 20px rgba(245, 158, 11, 0.35)',
                      backgroundColor: `${COLORS[capturingIdx % COLORS.length]}12`
                    }}
                  >
                    <span
                      className="w-4 h-4 rounded-full"
                      style={{
                        backgroundColor: COLORS[capturingIdx % COLORS.length],
                        boxShadow: `0 0 10px ${COLORS[capturingIdx % COLORS.length]}`
                      }}
                    />
                  </div>

                  <h3 className="text-sm font-extrabold text-slate-800 mt-5">Mapeando Região {capturingIdx + 1}</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-[210px] leading-relaxed">
                    Pressione as teclas no seu teclado físico para mapear este setor...
                  </p>

                  <button
                    onClick={() => setCapturingIdx(null)}
                    className="mt-6 border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-[10px] font-bold text-slate-500 px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-sm"
                  >
                    Cancelar Mapeamento
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Compact settings list */}
          <div className="w-[300px] shrink-0 flex flex-col gap-4">
            
            {/* Axis / Deadzone Settings Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-4">

              {/* Deadzone Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center px-0.5">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Zona Morta</span>
                  <span className="text-[11px] font-mono font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 rounded">
                    {(config.deadzone * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="range"
                    min={0.05}
                    max={0.9}
                    step={0.05}
                    value={config.deadzone}
                    onChange={(e) => setConfig((p) => ({ ...p, deadzone: Number(e.target.value) }))}
                    className="w-full accent-blue-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Shared Trigger */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold text-slate-700">Disparo Compartilhado</span>
                  <span className="text-[10px] text-slate-400 leading-normal max-w-[200px]">
                    Ativa múltiplos setores nas diagonais.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.regions.every((r) => r.allow_combination)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setConfig((prev) => ({
                        ...prev,
                        regions: prev.regions.map((r) => ({
                          ...r,
                          allow_combination: checked,
                          isolate_modifiers: !checked, // deprecated sync
                        })),
                      }))
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-400 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white peer-checked:after:border-white" />
                </label>
              </div>
            </div>

            {/* Presets and Region Subdivisions Management Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-4 flex-1">
              
              {/* Presets Selection */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-0.5">Presets de Direções</span>
                <div className="flex flex-col gap-1.5 mt-0.5">
                  {(
                    [
                      { value: '4-wasd', label: '🎮 4 Direções — WASD' },
                      { value: '4-arrows', label: '🔀 4 Direções — Setas Direcionais' },
                      { value: '8-wasd-diag', label: '🕹 8 Direções — WASD + ECZQ' },
                      { value: '8-wasd-chords', label: '⚡️ 8 Direções — WASD (WD SD SA WA)' },
                      { value: 'custom', label: '⚙ Personalizado' },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => applyPreset(value)}
                      className={`text-xs text-left px-3 py-2 rounded-lg border font-medium transition-all duration-200 shadow-sm cursor-pointer ${
                        preset === value
                          ? 'bg-blue-600 border-blue-500 text-white font-bold shadow-md shadow-blue-500/10'
                          : 'border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:border-slate-350'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subdivisions Controller */}
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-3.5">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-0.5">Gerenciar Regiões ({config.regions.length})</span>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={addRegion}
                    className="border border-slate-200 hover:border-slate-350 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 hover:text-slate-800 py-2 rounded-lg transition-all duration-150 flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                    title="Divide o maior setor do analógico adicionando uma nova área de mapeamento"
                  >
                    ⊕ Adicionar
                  </button>
                  <button
                    onClick={() => removeRegion(config.regions.length - 1)}
                    disabled={config.regions.length <= 1}
                    className="border border-slate-200 hover:border-slate-350 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 hover:text-slate-800 py-2 rounded-lg transition-all duration-150 flex items-center justify-center gap-1 cursor-pointer shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove o último setor angular adicionado"
                  >
                    ⊖ Remover
                  </button>
                  <button
                    onClick={() => {
                      setConfig((prev) => ({
                        ...prev,
                        regions: prev.regions.map((r) => ({ ...r, key_combos: [] }))
                      }))
                    }}
                    className="col-span-2 border border-slate-200 hover:border-red-200 hover:bg-red-50 text-[11px] font-bold text-slate-500 hover:text-red-600 py-2 rounded-lg transition-all duration-150 flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                    title="Limpa todos os mapeamentos de teclado de todas as regiões"
                  >
                    ✕ Limpar Mapeamentos
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer controls container */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 shadow-inner">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-transparent hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(config)}
            disabled={!canSave}
            className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all shadow-md shadow-blue-600/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Salvar Mapeamento
          </button>
        </div>

      </div>
    </Modal>
  )
}
