import { useCallback, useEffect, useRef, useState } from 'react'
import type { AngleMappingConfig } from '../../../shared/models'

interface Props {
  config: AngleMappingConfig
  onChange: (config: AngleMappingConfig) => void
}

const SIZE = 280
const CX = SIZE / 2
const CY = SIZE / 2
const R = 105
const ARC_W = 14
const NODE_R = 8
const LABEL_R = R * 0.58

const COLORS = [
  '#ef4444', '#22c55e', '#3b82f6', '#f97316',
  '#a855f7', '#06b6d4', '#ec4899', '#84cc16',
]

function toSvg(angleDeg: number, r = R) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) }
}

function arcPath(startAngle: number, endAngle: number): string {
  const span = (endAngle - startAngle + 360) % 360
  if (span < 0.1) return ''

  const s = toSvg(startAngle)
  const e = toSvg(endAngle)

  // Full circle: split into two semicircles (SVG arc is degenerate when start=end)
  if (span > 359.9) {
    const m = toSvg((startAngle + 180) % 360)
    return `M ${s.x} ${s.y} A ${R} ${R} 0 0 0 ${m.x} ${m.y} A ${R} ${R} 0 0 0 ${e.x} ${e.y}`
  }

  const largeArc = span > 180 ? 1 : 0
  // sweep=0 (CCW in SVG) traces the arc in the increasing-angle direction after Y-flip
  return `M ${s.x} ${s.y} A ${R} ${R} 0 ${largeArc} 0 ${e.x} ${e.y}`
}

function midAngleBetween(startAngle: number, endAngle: number): number {
  const span = (endAngle - startAngle + 360) % 360
  return (startAngle + span / 2) % 360
}

export default function AngleMappingEditor({ config, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const getAngle = useCallback((e: MouseEvent) => {
    if (!svgRef.current) return 0
    const rect = svgRef.current.getBoundingClientRect()
    const dx = e.clientX - rect.left - CX
    const dy = e.clientY - rect.top - CY
    return ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360
  }, [])

  useEffect(() => {
    if (!draggingId) return

    const onMove = (e: MouseEvent) => {
      const angle = Math.round(getAngle(e) * 10) / 10
      const updated = config.nodes.map((n) => (n.id === draggingId ? { ...n, angle } : n))
      // Keep sorted by angle
      const sorted = [...updated].sort((a, b) => a.angle - b.angle)
      onChange({ ...config, nodes: sorted })
    }

    const onUp = () => setDraggingId(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [draggingId, config, onChange, getAngle])

  const n = config.nodes.length

  return (
    <svg
      ref={svgRef}
      width={SIZE}
      height={SIZE}
      style={{ userSelect: 'none', cursor: draggingId ? 'grabbing' : 'default' }}
    >
      {/* Axis lines */}
      <line x1={CX - R - 16} y1={CY} x2={CX + R + 16} y2={CY} stroke="#cbd5e1" strokeWidth={1} />
      <line x1={CX} y1={CY - R - 16} x2={CX} y2={CY + R + 16} stroke="#cbd5e1" strokeWidth={1} />
      <text x={CX + R + 18} y={CY + 4} fontSize={9} fill="#94a3b8" textAnchor="start">X</text>
      <text x={CX + 4} y={CY - R - 18} fontSize={9} fill="#94a3b8" textAnchor="start">Y</text>

      {/* Deadzone circle */}
      <circle cx={CX} cy={CY} r={R * config.deadzone} fill="none" stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 2" />

      {/* Background ring */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e2e8f0" strokeWidth={ARC_W} />

      {/* Region arcs */}
      {config.nodes.map((node, i) => {
        const nextAngle = config.nodes[(i + 1) % n].angle
        const d = arcPath(node.angle, nextAngle)
        if (!d) return null
        const color = COLORS[i % COLORS.length]
        return (
          <path
            key={node.id}
            d={d}
            stroke={color}
            strokeWidth={ARC_W}
            fill="none"
            strokeLinecap="butt"
            opacity={0.85}
          />
        )
      })}

      {/* Region labels */}
      {config.nodes.map((node, i) => {
        const nextAngle = config.nodes[(i + 1) % n].angle
        const mid = midAngleBetween(node.angle, nextAngle)
        const { x, y } = toSvg(mid, LABEL_R)
        const combo = config.regions[i]?.key_combo || ''
        if (!combo) return null
        return (
          <text
            key={`label-${node.id}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fontWeight="700"
            fill="#1e293b"
          >
            {combo.length > 5 ? combo.slice(0, 5) + '…' : combo}
          </text>
        )
      })}

      {/* Draggable nodes */}
      {config.nodes.map((node) => {
        const { x, y } = toSvg(node.angle)
        return (
          <circle
            key={node.id}
            cx={x}
            cy={y}
            r={NODE_R}
            fill="#1e293b"
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => {
              e.preventDefault()
              setDraggingId(node.id)
            }}
          />
        )
      })}
    </svg>
  )
}
