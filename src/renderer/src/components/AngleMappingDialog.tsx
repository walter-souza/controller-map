import { useEffect, useState } from 'react'
import type { AngleMappingConfig } from '../../../shared/models'
import Modal from './Modal'
import AngleMappingEditor from './AngleMappingEditor'

interface Props {
  initial?: AngleMappingConfig
  defaultAxisX?: number
  defaultAxisY?: number
  onConfirm: (config: AngleMappingConfig) => void
  onCancel: () => void
}

const COLORS = [
  '#ef4444', '#22c55e', '#3b82f6', '#f97316',
  '#a855f7', '#06b6d4', '#ec4899', '#84cc16',
]

type Preset = '4-wasd' | '8-wasdqezc' | 'custom'

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
    // 4 regions: W=top, A=left, S=bottom, D=right
    return {
      ...base,
      nodes: makeNodes([45, 135, 225, 315]),
      regions: makeRegions(['w', 'a', 's', 'd']),
    }
  }

  if (preset === '8-wasdqezc') {
    // 8 regions at 45° intervals; boundary midpoints at multiples of 45° - 22.5°
    // Region centers: E=upper-right(45°), W=up(90°), Q=upper-left(135°),
    //   A=left(180°), Z=lower-left(225°), X=down(270°), C=lower-right(315°), D=right(0°)
    return {
      ...base,
      nodes: makeNodes([22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]),
      regions: makeRegions(['e', 'w', 'q', 'a', 'z', 'x', 'c', 'd']),
    }
  }

  // custom — blank single region
  return {
    ...base,
    nodes: makeNodes([0]),
    regions: makeRegions(['']),
  }
}

function detectPreset(cfg: AngleMappingConfig): Preset {
  const combos = cfg.regions.map((r) => r.key_combos[0] ?? '').join(',')
  if (combos === 'w,a,s,d') return '4-wasd'
  if (combos === 'e,w,q,a,z,x,c,d') return '8-wasdqezc'
  return 'custom'
}

export default function AngleMappingDialog({ initial, defaultAxisX, defaultAxisY, onConfirm, onCancel }: Props) {
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
      setConfig((prev) => ({
        ...createFromPreset(p, prev.id),
        axis_x: prev.axis_x,
        axis_y: prev.axis_y,
        deadzone: prev.deadzone,
      }))
    }
  }

  // Keyboard capture for a specific region
  useEffect(() => {
    if (capturingIdx === null) return

    window.api.invoke('keyboard:capture-start')

    const off = window.api.on('keyboard:key-captured', (combo) => {
      window.api.invoke('keyboard:capture-stop')
      setConfig((prev) => {
        const newRegions = prev.regions.map((r, i) =>
          i === capturingIdx ? { ...r, key_combos: [...r.key_combos, combo] } : r,
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

  const canSave = config.nodes.length >= 1 && config.regions.some((r) => r.key_combos.some((k) => k.trim()))

  const removeCombo = (regionIdx: number, comboIdx: number) => {
    setConfig((prev) => {
      const newRegions = prev.regions.map((r, i) =>
        i === regionIdx ? { ...r, key_combos: r.key_combos.filter((_, ci) => ci !== comboIdx) } : r,
      )
      return { ...prev, regions: newRegions }
    })
  }

  return (
    <Modal title="Mapeamento por Ângulo" onClose={onCancel}>
      <div className="flex flex-col gap-4">
        {/* Preset selector — shown only when creating new (no initial) */}
        {!initial && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 flex-shrink-0">Preset</span>
            {(
              [
                { value: '4-wasd', label: '4 dir. — WASD' },
                { value: '8-wasdqezc', label: '8 dir. — QWEADZXC' },
                { value: 'custom', label: 'Personalizado' },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => applyPreset(value)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  preset === value
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'border-slate-200 text-slate-500 hover:border-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Axis / deadzone config */}
        <div className="flex items-center gap-4 text-xs">
          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Eixo X</span>
            <select
              value={config.axis_x}
              onChange={(e) => setConfig((p) => ({ ...p, axis_x: Number(e.target.value) }))}
              className="border border-slate-200 rounded px-1.5 py-0.5 text-xs"
            >
              {Array.from({ length: 8 }, (_, i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Eixo Y</span>
            <select
              value={config.axis_y}
              onChange={(e) => setConfig((p) => ({ ...p, axis_y: Number(e.target.value) }))}
              className="border border-slate-200 rounded px-1.5 py-0.5 text-xs"
            >
              {Array.from({ length: 8 }, (_, i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Zona morta</span>
            <input
              type="range"
              min={0.05}
              max={0.9}
              step={0.05}
              value={config.deadzone}
              onChange={(e) => setConfig((p) => ({ ...p, deadzone: Number(e.target.value) }))}
              className="w-20"
            />
            <span className="text-slate-400 w-8">{config.deadzone.toFixed(2)}</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
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
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-slate-500 select-none">Disparo Compartilhado</span>
          </label>
        </div>

        {/* SVG editor */}
        <div className="flex justify-center">
          <AngleMappingEditor config={config} onChange={setConfig} />
        </div>

        {/* Regions list */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Regiões</div>
          {config.regions.map((region, i) => (
            <div key={region.id} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-xs text-slate-500 w-14 flex-shrink-0">Região {i + 1}</span>
              <div className="flex-1 min-w-0">
                {capturingIdx === i ? (
                  <div className="text-xs text-blue-600 animate-pulse border border-blue-300 rounded px-2 py-1 bg-blue-50">
                    Pressione as teclas…
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1">
                    {region.key_combos.length === 0 && (
                      <span className="text-slate-400 italic text-xs">vazio</span>
                    )}
                    {region.key_combos.map((k, ki) => (
                      <span key={ki} className="badge-key text-xs flex items-center gap-1 pl-2 pr-1 py-0.5">
                        {k}
                        <button
                          onClick={() => removeCombo(i, ki)}
                          className="text-slate-400 hover:text-red-500 leading-none"
                          title="Remover tecla"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() => setCapturingIdx(i)}
                      className="btn-ghost text-xs px-2 py-0.5 flex-shrink-0"
                    >
                      + Tecla
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => removeRegion(i)}
                disabled={config.nodes.length <= 1}
                className="btn-ghost text-red-400 hover:text-red-600 text-xs disabled:opacity-30"
                title="Remover região"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addRegion}
          className="btn-ghost text-xs text-slate-500 self-start"
        >
          + Adicionar Região
        </button>

        {/* Footer buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onCancel} className="btn-ghost text-xs">Cancelar</button>
          <button onClick={() => onConfirm(config)} disabled={!canSave} className="btn-primary text-xs disabled:opacity-40">
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  )
}
