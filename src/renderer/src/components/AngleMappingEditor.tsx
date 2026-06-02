import { useCallback, useEffect, useRef, useState } from 'react'
import type { AngleMappingConfig } from '../../../shared/models'

interface Props {
  config: AngleMappingConfig
  onChange: (config: AngleMappingConfig) => void
  onSelectRegion?: (idx: number) => void
  axisXVal?: number
  axisYVal?: number
}

const SIZE = 360
const CX = SIZE / 2
const CY = SIZE / 2
const R = 145
const ARC_W = 18
const NODE_R = 10
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

function sectorPath(startAngle: number, endAngle: number): string {
  const span = (endAngle - startAngle + 360) % 360
  if (span < 0.1) return ''

  const s = toSvg(startAngle, R + ARC_W / 2 + 4)
  const e = toSvg(endAngle, R + ARC_W / 2 + 4)

  // Full circle: draw a complete circle slice
  if (span > 359.9) {
    const r = R + ARC_W / 2 + 4
    return `M ${CX} ${CY} m -${r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 -${r * 2} 0`
  }

  const largeArc = span > 180 ? 1 : 0
  return `M ${CX} ${CY} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R + ARC_W / 2 + 4} ${R + ARC_W / 2 + 4} 0 ${largeArc} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`
}

function midAngleBetween(startAngle: number, endAngle: number): number {
  const span = (endAngle - startAngle + 360) % 360
  return (startAngle + span / 2) % 360
}

export default function AngleMappingEditor({ config, onChange, onSelectRegion, axisXVal = 0, axisYVal = 0 }: Props) {
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
      className="select-none overflow-visible"
      style={{ cursor: draggingId ? 'grabbing' : 'default' }}
    >
      <defs>
        <radialGradient id="editor-bg-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </radialGradient>
        <filter id="glow-editor" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Light background circle with premium stroke */}
      <circle
        cx={CX}
        cy={CY}
        r={R + ARC_W / 2 + 6}
        fill="url(#editor-bg-grad)"
        stroke="#cbd5e1"
        strokeWidth={1.5}
        className="shadow-sm"
      />

      {/* Axis crosshair lines */}
      <line x1={CX - R - 20} y1={CY} x2={CX + R + 20} y2={CY} stroke="rgba(15, 23, 42, 0.06)" strokeWidth={1} />
      <line x1={CX} y1={CY - R - 20} x2={CX} y2={CY + R + 20} stroke="rgba(15, 23, 42, 0.06)" strokeWidth={1} />
      <text x={CX + R + 24} y={CY + 3} fontSize={9} fontWeight="900" fill="#94a3b8" textAnchor="start">X</text>
      <text x={CX} y={CY - R - 24} fontSize={9} fontWeight="900" fill="#94a3b8" textAnchor="middle">Y</text>

      {/* Deadzone visualizer dashed circle */}
      <circle
        cx={CX}
        cy={CY}
        r={R * config.deadzone}
        fill="rgba(15, 23, 42, 0.01)"
        stroke="rgba(15, 23, 42, 0.12)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />

      {/* Track guides */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(15, 23, 42, 0.01)" strokeWidth={ARC_W} />
      <circle cx={CX} cy={CY} r={R - ARC_W / 2} fill="none" stroke="#cbd5e1" strokeWidth={0.8} opacity={0.6} />
      <circle cx={CX} cy={CY} r={R + ARC_W / 2} fill="none" stroke="#cbd5e1" strokeWidth={0.8} opacity={0.6} />

      {/* Region division lines (dashed lines from center to outer ring) */}
      {config.nodes.map((node) => {
        const { x, y } = toSvg(node.angle, R + ARC_W / 2)
        return (
          <line
            key={`division-line-${node.id}`}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke="rgba(15, 23, 42, 0.15)"
            strokeWidth={1}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )
      })}

      {/* Region arcs with soft glow underlay and sharp core */}
      {config.nodes.map((node, i) => {
        const nextAngle = config.nodes[(i + 1) % n].angle
        const d = arcPath(node.angle, nextAngle)
        if (!d) return null
        const color = COLORS[i % COLORS.length]
        
        // Calculate real-time active state
        const dx = axisXVal
        const dy = axisYVal
        const magnitude = Math.sqrt(dx * dx + dy * dy)
        const outsideDeadzone = magnitude > config.deadzone
        const mathDeg = outsideDeadzone ? ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360 : -1

        const isActive = outsideDeadzone && (() => {
          const span = (nextAngle - node.angle + 360) % 360
          const offset = (mathDeg - node.angle + 360) % 360
          return offset < span && offset >= 0
        })()

        return (
          <g key={`region-arc-${node.id}`}>
            {/* Glow underlay */}
            <path
              d={d}
              stroke={color}
              strokeWidth={ARC_W + (isActive ? 4 : 2)}
              fill="none"
              strokeLinecap="butt"
              filter="url(#glow-editor)"
              opacity={isActive ? 0.55 : 0.2}
              pointerEvents="none"
            />
            {/* Core slice */}
            <path
              d={d}
              stroke={color}
              strokeWidth={ARC_W}
              fill="none"
              strokeLinecap="butt"
              opacity={isActive ? 1.0 : 0.85}
              pointerEvents="none"
            />
          </g>
        )
      })}

      {/* Soft active sector shading wedges (glowing sector fills when triggered) */}
      {config.nodes.map((node, i) => {
        const nextAngle = config.nodes[(i + 1) % n].angle
        const dSector = sectorPath(node.angle, nextAngle)
        if (!dSector) return null
        const color = COLORS[i % COLORS.length]

        // Calculate real-time active state
        const dx = axisXVal
        const dy = axisYVal
        const magnitude = Math.sqrt(dx * dx + dy * dy)
        const outsideDeadzone = magnitude > config.deadzone
        const mathDeg = outsideDeadzone ? ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360 : -1

        const isActive = outsideDeadzone && (() => {
          const span = (nextAngle - node.angle + 360) % 360
          const offset = (mathDeg - node.angle + 360) % 360
          return offset < span && offset >= 0
        })()

        if (!isActive) return null

        return (
          <path
            key={`active-shading-${node.id}`}
            d={dSector}
            fill={color}
            opacity={0.06}
            pointerEvents="none"
          />
        )
      })}

      {/* Invisible clickable sector slices covering the whole wedge with subtle hover feedback */}
      {config.nodes.map((node, i) => {
        const nextAngle = config.nodes[(i + 1) % n].angle
        const dSector = sectorPath(node.angle, nextAngle)
        if (!dSector) return null
        return (
          <path
            key={`clickable-sector-${node.id}`}
            d={dSector}
            fill="transparent"
            pointerEvents="all"
            className="cursor-pointer transition-colors duration-150 hover:fill-slate-500/[0.04]"
            onClick={() => onSelectRegion?.(i)}
            title={`Clique para mapear Região ${i + 1}`}
          />
        )
      })}

      {/* Region key shortcut labels inside the analog face */}
      {config.nodes.map((node, i) => {
        const nextAngle = config.nodes[(i + 1) % n].angle
        const mid = midAngleBetween(node.angle, nextAngle)
        const { x, y } = toSvg(mid, LABEL_R)
        const combo = config.regions[i]?.key_combos[0] ?? ''
        if (!combo) return null

        // Calculate dynamic pill width based on text length to show the full string
        const displayCombo = combo.toUpperCase()
        const pillWidth = displayCombo.length === 1 ? 20 : displayCombo.length * 6 + 12
        const pillHeight = 16

        return (
          <g key={`label-group-${node.id}`} className="pointer-events-none">
            {/* Subtle background capsule for label readability */}
            <rect
              x={x - pillWidth / 2}
              y={y - pillHeight / 2}
              width={pillWidth}
              height={pillHeight}
              rx={8}
              ry={8}
              fill="#ffffff"
              opacity={0.95}
              stroke="#cbd5e1"
              strokeWidth={0.5}
              style={{ filter: 'drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.08))' }}
            />
            <text
              x={x}
              y={y + 0.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontWeight="950"
              fill="#0f172a"
              style={{ textShadow: '0px 1px 2px rgba(255, 255, 255, 0.9)' }}
              className="font-mono uppercase tracking-tighter text-center"
            >
              {displayCombo}
            </text>
          </g>
        )
      })}

      {/* Draggable subdivision nodes (styled like premium analog controller knobs - Light Theme) */}
      {config.nodes.map((node, i) => {
        const { x, y } = toSvg(node.angle)
        return (
          <g
            key={`node-handle-${node.id}`}
            style={{ cursor: draggingId ? 'grabbing' : 'grab' }}
            onMouseDown={(e) => {
              e.preventDefault()
              setDraggingId(node.id)
            }}
          >
            {/* Outer grip ring */}
            <circle
              cx={x}
              cy={y}
              r={NODE_R}
              fill="#ffffff"
              stroke="#94a3b8"
              strokeWidth={1.5}
              style={{ filter: 'drop-shadow(0px 1.5px 2.5px rgba(0, 0, 0, 0.15))' }}
            />
            {/* Inner ring */}
            <circle
              cx={x}
              cy={y}
              r={NODE_R - 2.5}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={0.8}
            />
            {/* Colored center core */}
            <circle
              cx={x}
              cy={y}
              r={3.8}
              fill={COLORS[i % COLORS.length]}
            />
            {/* Reflection flare */}
            <circle
              cx={x - 1.2}
              cy={y - 1.2}
              r={0.8}
              fill="white"
              opacity={0.8}
            />
          </g>
        )
      })}

      {/* Real-time joystick position indicator dot */}
      {(() => {
        const dx = axisXVal
        const dy = axisYVal
        const magnitude = Math.sqrt(dx * dx + dy * dy)
        const outsideDeadzone = magnitude > config.deadzone

        // Clamp diagonal/maximum input coordinates within the unit circle (normalization)
        const normDx = magnitude > 1.0 ? dx / magnitude : dx
        const normDy = magnitude > 1.0 ? dy / magnitude : dy

        const dotX = CX + normDx * R * 0.9
        const dotY = CY + normDy * R * 0.9

        return (
          <g key="realtime-dot" className="pointer-events-none">
            {/* Soft shadow */}
            <circle
              cx={dotX}
              cy={dotY}
              r={7}
              fill="#020617"
              stroke={outsideDeadzone ? '#facc15' : '#94a3b8'}
              strokeWidth={1.2}
              opacity={0.8}
              style={{ filter: 'drop-shadow(0px 2px 3px rgba(0,0,0,0.3))' }}
            />
            {/* Glowing core */}
            <circle
              cx={dotX}
              cy={dotY}
              r={4}
              fill={outsideDeadzone ? '#facc15' : '#64748b'}
              style={{
                filter: outsideDeadzone ? 'drop-shadow(0px 0px 4px #facc15)' : 'none'
              }}
            />
            {/* Reflection flare */}
            <circle cx={dotX - 1.2} cy={dotY - 1.2} r={0.8} fill="white" opacity="0.8" />
          </g>
        )
      })()}
    </svg>
  )
}
