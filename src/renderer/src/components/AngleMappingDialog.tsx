import { useEffect, useState } from 'react'
import type { AngleMappingConfig } from '../../../shared/models'
import Modal from './Modal'
import AngleMappingEditor from './AngleMappingEditor'

interface Props {
  initial?: AngleMappingConfig
  onConfirm: (config: AngleMappingConfig) => void
  onCancel: () => void
}

const COLORS = [
  '#ef4444', '#22c55e', '#3b82f6', '#f97316',
  '#a855f7', '#06b6d4', '#ec4899', '#84cc16',
]

function createDefault(): AngleMappingConfig {
  return {
    id: crypto.randomUUID(),
    axis_x: 0,
    axis_y: 1,
    deadzone: 0.2,
    nodes: [
      { id: crypto.randomUUID(), angle: 45 },
      { id: crypto.randomUUID(), angle: 135 },
      { id: crypto.randomUUID(), angle: 225 },
      { id: crypto.randomUUID(), angle: 315 },
    ],
    regions: [
      { id: crypto.randomUUID(), key_combo: 'w' },
      { id: crypto.randomUUID(), key_combo: 'a' },
      { id: crypto.randomUUID(), key_combo: 's' },
      { id: crypto.randomUUID(), key_combo: 'd' },
    ],
  }
}

export default function AngleMappingDialog({ initial, onConfirm, onCancel }: Props) {
  const [config, setConfig] = useState<AngleMappingConfig>(initial ?? createDefault())
  const [capturingIdx, setCapturingIdx] = useState<number | null>(null)

  // Keyboard capture for a specific region
  useEffect(() => {
    if (capturingIdx === null) return

    window.api.invoke('keyboard:capture-start')

    const off = window.api.on('keyboard:key-captured', (combo) => {
      window.api.invoke('keyboard:capture-stop')
      setConfig((prev) => {
        const newRegions = prev.regions.map((r, i) =>
          i === capturingIdx ? { ...r, key_combo: combo } : r,
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
    const n = config.nodes.length
    if (n === 0) {
      setConfig((prev) => ({
        ...prev,
        nodes: [{ id: crypto.randomUUID(), angle: 0 }],
        regions: [{ id: crypto.randomUUID(), key_combo: '' }],
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
    newRegions.splice(maxIdx + 1, 0, { id: crypto.randomUUID(), key_combo: '' })

    setConfig((prev) => ({ ...prev, nodes: newNodes, regions: newRegions }))
  }

  const removeRegion = (idx: number) => {
    if (config.nodes.length <= 1) return
    const newNodes = config.nodes.filter((_, i) => i !== idx)
    const newRegions = config.regions.filter((_, i) => i !== idx)
    setConfig((prev) => ({ ...prev, nodes: newNodes, regions: newRegions }))
  }

  const canSave = config.nodes.length >= 1 && config.regions.some((r) => r.key_combo.trim())

  return (
    <Modal title="Mapeamento por Ângulo" onClose={onCancel}>
      <div className="flex flex-col gap-4">
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
              max={0.5}
              step={0.05}
              value={config.deadzone}
              onChange={(e) => setConfig((p) => ({ ...p, deadzone: Number(e.target.value) }))}
              className="w-20"
            />
            <span className="text-slate-400 w-8">{config.deadzone.toFixed(2)}</span>
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
                  <div className="flex items-center gap-1">
                    <span className="badge-key text-xs flex-1 truncate min-h-[24px] flex items-center">
                      {region.key_combo || <span className="text-slate-400 italic">vazio</span>}
                    </span>
                    <button
                      onClick={() => setCapturingIdx(i)}
                      className="btn-ghost text-xs px-2 py-0.5 flex-shrink-0"
                    >
                      Capturar
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
