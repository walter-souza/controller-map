import { memo, useState, cloneElement, ReactElement } from 'react'
import type { AngleMappingConfig, ControllerAxisDef, ControllerInputDef, ControllerProfile, CaptureResult, Mapping, StickDef } from '../../../shared/models'

// ── Layout constants (% of container) ─────────────────────────────────────────
const IMG_LEFT   = 20
const IMG_WIDTH  = 60
const LBL_L_X    = 17
const LBL_R_X    = 83
const ELBOW_L_X  = 22
const ELBOW_R_X  = 78
const MIN_GAP    = 10.5
const DOT_RX     = 0.38
const DOT_RY     = 0.98

// ── JoystickPad constants ─────────────────────────────────────────────────────
const PAD_CX      = 45
const PAD_CY      = 45
const PAD_R       = 38
const PAD_DEADZONE = 0.05

interface Props {
  profile: ControllerProfile
  mappings: Mapping[]
  angleMappings: AngleMappingConfig[]
  isPlaying: boolean
  activeInputs?: Set<string>
  axisValues?: Record<number, number>
  onAddMapping: (presetInput: CaptureResult) => void
  onDeleteMapping: (mapping: Mapping) => void
  onEditAngleMapping: (stick: StickDef) => void
}

function findMapping(input: ControllerInputDef, mappings: Mapping[]): Mapping | undefined {
  return mappings.find((m) => {
    if (input.type === 'button') {
      return m.source_type === 'button' && m.button_id === input.id && !m.chord_inputs?.length
    }
    return m.source_type === 'axis' && m.button_id === input.axis_id && m.axis_direction === input.direction && !m.chord_inputs?.length
  })
}

function isAxisMapped(axisId: number, direction: number, mappings: Mapping[]): boolean {
  return mappings.some(
    (m) => m.source_type === 'axis' && m.button_id === axisId && m.axis_direction === direction && !m.chord_inputs?.length
  )
}

function isInputActive(input: ControllerInputDef, activeInputs: Set<string>): boolean {
  if (input.type === 'button') return activeInputs.has(`b:${input.id}`)
  return activeInputs.has(`a:${input.axis_id}:${input.direction}`)
}

function toCaptureResult(input: ControllerInputDef): CaptureResult {
  if (input.type === 'button') {
    return { type: 'button', button_id: input.id, button_name: input.name }
  }
  return { type: 'axis', button_id: input.axis_id, button_name: input.name, axis_direction: input.direction }
}

function inputKey(input: ControllerInputDef): string {
  return input.type === 'button' ? `btn-${input.id}` : `axis-${input.axis_id}-${input.direction}`
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

function btnX(input: ControllerInputDef): number {
  return IMG_LEFT + input.x * (IMG_WIDTH / 100)
}

function spreadLabels(inputs: ControllerInputDef[]): Array<{ input: ControllerInputDef; labelY: number }> {
  const sorted = [...inputs].sort((a, b) => a.y - b.y)
  const result: Array<{ input: ControllerInputDef; labelY: number }> = []
  let prev = -Infinity
  for (const input of sorted) {
    const labelY = Math.max(input.y, prev + MIN_GAP)
    result.push({ input, labelY })
    prev = labelY
  }
  return result
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

// Draws a pie-slice sector from center, arc extent determines largeArcFlag automatically
function sectorPath(startDeg: number, endDeg: number): string {
  const s = degToRad(startDeg)
  const e = degToRad(endDeg)
  const x1 = PAD_CX + PAD_R * Math.cos(s)
  const y1 = PAD_CY + PAD_R * Math.sin(s)
  const x2 = PAD_CX + PAD_R * Math.cos(e)
  const y2 = PAD_CY + PAD_R * Math.sin(e)
  let extent = endDeg - startDeg
  if (extent <= 0) extent += 360
  const largeArc = extent > 180 ? 1 : 0
  return `M ${PAD_CX} ${PAD_CY} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${PAD_R} ${PAD_R} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
}

// ── Dynamic sector computation ────────────────────────────────────────────────
// Cardinal angles in SVG coords (y-down): right=0, down=90, left=180, up=270
interface SectorDef {
  startDeg: number
  endDeg: number
  isActive: boolean
  isMapped: boolean
  keyCombo?: string
}

function computePadSectors(
  stick: StickDef,
  mappings: Mapping[],
  activeInputs: Set<string>
): SectorDef[] {
  const DIRS = [
    { centerDeg: 270, axisId: stick.axis_y, dir: -1 }, // up
    { centerDeg: 0,   axisId: stick.axis_x, dir:  1 }, // right
    { centerDeg: 90,  axisId: stick.axis_y, dir:  1 }, // down
    { centerDeg: 180, axisId: stick.axis_x, dir: -1 }, // left
  ]
  const relevant = DIRS
    .map((d) => {
      const mapping = mappings.find(
        (m) => m.source_type === 'axis' && m.button_id === d.axisId && m.axis_direction === d.dir && !m.chord_inputs?.length
      )
      return {
        centerDeg: d.centerDeg,
        isMapped: mapping !== undefined,
        isActive: activeInputs.has(`a:${d.axisId}:${d.dir}`),
        keyCombo: mapping?.key_combo.toUpperCase(),
      }
    })
    .filter((d) => d.isMapped || d.isActive)

  const n = relevant.length
  if (n === 0) return []
  if (n === 1) {
    return [{ startDeg: 0, endDeg: 360, isActive: relevant[0].isActive, isMapped: relevant[0].isMapped, keyCombo: relevant[0].keyCombo }]
  }

  // Sort by cardinal angle, then split the circle at midpoints between adjacent directions
  const sorted = [...relevant].sort((a, b) => a.centerDeg - b.centerDeg)
  const boundaries = sorted.map((s, i) => {
    const next = sorted[(i + 1) % n]
    if (next.centerDeg > s.centerDeg) return (s.centerDeg + next.centerDeg) / 2
    // Wraparound (e.g., last sector at 270° → first at 0°): midpoint crosses the 0°/360° boundary
    return ((s.centerDeg + next.centerDeg + 360) / 2) % 360
  })

  return sorted.map((s, i) => ({
    startDeg: boundaries[(i - 1 + n) % n],
    endDeg: boundaries[i],
    isActive: s.isActive,
    isMapped: s.isMapped,
    keyCombo: s.keyCombo,
  }))
}

// Compute sectors from an AngleMappingConfig for real-time joystick pad rendering.
// AngleMappingConfig angles: 0=right, 90=up, 180=left, 270=down (math CCW, y-up).
// JoystickPad SVG angles: 0=right, 90=down, 180=left, 270=up (CW, y-down).
// Conversion: svgAngle = (360 - mathAngle) % 360, and region start/end are swapped.
// Compute sectors from an AngleMappingConfig for real-time joystick pad rendering.
function computePadSectorsFromAngleMapping(
  cfg: AngleMappingConfig,
  axisX: number,
  axisY: number,
): SectorDef[] {
  const n = cfg.nodes.length
  if (n === 0) return []

  const magnitude = Math.sqrt(axisX * axisX + axisY * axisY)
  const outsideDeadzone = magnitude > cfg.deadzone
  // Math angle: atan2(-axisY, axisX) because SDL axisY is positive-down but math Y is up
  const mathDeg = outsideDeadzone
    ? ((Math.atan2(-axisY, axisX) * 180) / Math.PI + 360) % 360
    : -1

  return cfg.nodes.map((node, i) => {
    const nextAngle = cfg.nodes[(i + 1) % n].angle
    const span = (nextAngle - node.angle + 360) % 360

    let isActive = false
    if (outsideDeadzone && mathDeg >= 0) {
      const offset = (mathDeg - node.angle + 360) % 360
      isActive = offset < span && offset >= 0
    }

    const isMapped = (cfg.regions[i]?.key_combos ?? []).some((k) => k.trim().length > 0)
    const combos = cfg.regions[i]?.key_combos ?? []
    const keyCombo = combos.filter((k) => k.trim()).join(' + ').toUpperCase()

    // Convert math angles → SVG: negate + swap start/end (flip Y axis, CCW→CW)
    const svgStart = (360 - nextAngle + 360) % 360
    const svgEnd   = (360 - node.angle + 360) % 360

    return { startDeg: svgStart, endDeg: svgEnd, isActive, isMapped, keyCombo }
  })
}

// ── JoystickPad component ─────────────────────────────────────────────────────
interface PadProps {
  stick: StickDef
  axisX: number
  axisY: number
  sectors: SectorDef[]
  deadzone: number
  onClick?: () => void
}

const JoystickPad = memo(function JoystickPad({ stick, axisX, axisY, sectors, deadzone, onClick }: PadProps) {
  const dx = Math.abs(axisX) < PAD_DEADZONE ? 0 : Math.max(-1, Math.min(1, axisX))
  const dy = Math.abs(axisY) < PAD_DEADZONE ? 0 : Math.max(-1, Math.min(1, axisY))
  const dotX = PAD_CX + dx * PAD_R * 0.82
  const dotY = PAD_CY + dy * PAD_R * 0.82
  const anyActive = sectors.some((s) => s.isActive)
  const anyMapped = sectors.some((s) => s.isMapped)
  const isFullCircle = sectors.length === 1

  function sectorFill(isActive: boolean, isMapped: boolean): string {
    if (isActive) return 'rgba(250, 204, 21, 0.35)'
    if (isMapped) return 'rgba(59, 130, 246, 0.12)'
    return 'transparent'
  }

  function sectorStroke(isActive: boolean, isMapped: boolean): string {
    if (isActive) return 'rgba(250, 204, 21, 0.6)'
    if (isMapped) return 'rgba(59, 130, 246, 0.35)'
    return 'none'
  }

  const activeCombos = sectors
    .filter((s) => s.isActive && s.keyCombo)
    .map((s) => s.keyCombo)
  const activeComboText = activeCombos.length > 0 ? activeCombos.join(' + ') : null

  const renderTriggerLabel = () => {
    if (activeComboText) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[8px] font-sans font-extrabold bg-yellow-50 border border-yellow-600 text-slate-950 shadow-sm animate-pulse transition-all">
          {activeComboText}
        </span>
      )
    }
    if (anyActive) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[8px] font-sans font-extrabold bg-yellow-50 border border-yellow-600 text-slate-950 shadow-sm transition-all">
          LIVRE
        </span>
      )
    }
    return (
      <span className="px-1.5 py-0.5 rounded text-[8px] font-sans font-bold bg-slate-100 border border-slate-200 text-slate-400 uppercase tracking-widest opacity-80">
        INATIVO
      </span>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1 group select-none">
      {/* Active Mapping Indicator Label above the analog stick */}
      <div className="h-5 flex items-center justify-center mb-1">
        {renderTriggerLabel()}
      </div>

      <div
        onClick={onClick}
        title={onClick ? `Editar mapeamento de ${stick.name}` : undefined}
        className={[
          'transition-all duration-300 rounded-full p-1',
          onClick 
            ? 'cursor-pointer hover:bg-slate-900/40 border border-transparent hover:border-white/5 active:scale-95' 
            : ''
        ].join(' ')}
      >
      <svg width="88" height="88" viewBox="0 0 90 90">
        <defs>
          <radialGradient id={`pad-bg-grad-${stick.name}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </radialGradient>
          <filter id={`pad-glow-${stick.name}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background circle with gradient */}
        <circle cx={PAD_CX} cy={PAD_CY} r={PAD_R + 4} fill={`url(#pad-bg-grad-${stick.name})`} stroke="#334155" strokeWidth="1" />
        
        {/* Sectors: full circle when only 1 mapped direction; pie slices otherwise */}
        {isFullCircle
          ? (
            <circle
              cx={PAD_CX}
              cy={PAD_CY}
              r={PAD_R}
              fill={sectorFill(sectors[0].isActive, sectors[0].isMapped)}
              stroke={sectorStroke(sectors[0].isActive, sectors[0].isMapped)}
              strokeWidth={sectors[0].isActive ? 1.2 : sectors[0].isMapped ? 0.8 : 0}
            />
          )
          : sectors.map((s, i) => (
            <path
              key={i}
              d={sectorPath(s.startDeg, s.endDeg)}
              fill={sectorFill(s.isActive, s.isMapped)}
              stroke={sectorStroke(s.isActive, s.isMapped)}
              strokeWidth={s.isActive ? 1.2 : s.isMapped ? 0.8 : 0}
            />
          ))
        }
        
        {/* Inner grid / H+V crosshair lines */}
        <line x1={PAD_CX - PAD_R} y1={PAD_CY} x2={PAD_CX + PAD_R} y2={PAD_CY} stroke="rgba(255, 255, 255, 0.08)" strokeWidth="0.5" />
        <line x1={PAD_CX} y1={PAD_CY - PAD_R} x2={PAD_CX} y2={PAD_CY + PAD_R} stroke="rgba(255, 255, 255, 0.08)" strokeWidth="0.5" />
        
        {/* Sector boundary lines from center to rim (skip when full circle) */}
        {!isFullCircle && sectors.map((s, i) => {
          const rad = degToRad(s.startDeg)
          return (
            <line
              key={i}
              x1={PAD_CX} y1={PAD_CY}
              x2={(PAD_CX + PAD_R * Math.cos(rad)).toFixed(2)}
              y2={(PAD_CY + PAD_R * Math.sin(rad)).toFixed(2)}
              stroke="rgba(255, 255, 255, 0.08)" strokeWidth="0.5"
            />
          )
        })}

        {/* Deadzone visualizer dashed circle */}
        <circle
          cx={PAD_CX}
          cy={PAD_CY}
          r={PAD_R * deadzone}
          fill="none"
          stroke="rgba(255, 255, 255, 0.18)"
          strokeWidth="0.8"
          strokeDasharray="3 3"
        />

        {/* Inner ring */}
        <circle
          cx={PAD_CX}
          cy={PAD_CY}
          r={PAD_R}
          fill="none"
          stroke={anyActive ? '#facc15' : anyMapped ? '#3b82f6' : '#475569'}
          strokeWidth={anyActive ? 1.2 : 0.8}
          filter={anyActive ? `url(#pad-glow-${stick.name})` : 'none'}
          opacity={anyActive ? 1.0 : anyMapped ? 0.7 : 0.4}
          className="transition-all duration-150"
        />

        {/* Dot shadow + dot */}
        <circle cx={dotX} cy={dotY} r={6.5} fill="#020617" stroke={anyActive ? '#facc15' : '#475569'} strokeWidth="1" />
        <circle
          cx={dotX}
          cy={dotY}
          r={4.0}
          fill={anyActive ? '#facc15' : '#64748b'}
          filter={anyActive ? `url(#pad-glow-${stick.name})` : 'none'}
        />
        <circle cx={dotX - 1.2} cy={dotY - 1.2} r={0.8} fill="white" opacity="0.5" />
      </svg>
      </div>
      <span className={[
        "px-2 py-0.5 rounded text-[9px] font-sans font-extrabold uppercase tracking-widest shadow-sm transition-all border mt-0.5",
        anyActive 
          ? "bg-yellow-50 border-yellow-600 text-slate-950 font-black"
          : anyMapped
            ? "bg-blue-500 border-blue-600 text-white font-bold"
            : "bg-slate-100 border-slate-200 text-slate-500 font-bold"
      ].join(' ')}>
        {stick.name}
      </span>
      {onClick && (
        <span className="text-[8px] uppercase tracking-wider text-slate-500 font-semibold group-hover:text-blue-400 transition-colors duration-150 mt-1 opacity-75">
          Clique para editar
        </span>
      )}
    </div>
  )
})

// ── Main component ────────────────────────────────────────────────────────────
export default function VisualMappingView({
  profile, mappings, angleMappings, isPlaying, activeInputs = new Set(), axisValues = {}, onAddMapping, onDeleteMapping, onEditAngleMapping,
}: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  // Axes that belong to defined sticks — excluded from guide lines (shown as pad visualizers)
  const stickAxisIds = new Set(
    (profile.sticks ?? []).flatMap((s) => [s.axis_x, s.axis_y])
  )
  const guideInputs = profile.inputs.filter(
    (i) => i.type === 'button' || !stickAxisIds.has((i as ControllerAxisDef).axis_id)
  )

  const isCentralButton = (input: ControllerInputDef) =>
    input.name === 'Select' || input.name === 'Home' || input.name === 'Start'

  const centralInputs = guideInputs.filter(isCentralButton)
  const nonCentralInputs = guideInputs.filter((i) => !isCentralButton(i))

  const leftLabels  = spreadLabels(nonCentralInputs.filter((i) => i.x < 50))
  const rightLabels = spreadLabels(nonCentralInputs.filter((i) => i.x >= 50))
  const chordMappings = mappings.filter((m) => m.chord_inputs?.length)

  // ── SVG style helpers ───────────────────────────────────────────────────────
  function svgStyle(input: ControllerInputDef, mapped: Mapping | undefined) {
    const key    = inputKey(input)
    const active  = isInputActive(input, activeInputs)
    const hovered = hoveredKey === key
    if (active)  return { color: '#ca8a04', opacity: 1.0, sw: '0.45', glow: true }
    if (hovered) return { color: mapped ? '#2563eb' : '#64748b', opacity: 1.0, sw: '0.45', glow: true }
    if (mapped)  return { color: '#2563eb', opacity: 0.8, sw: '0.28', glow: false }
    return { color: '#cbd5e1', opacity: 0.8, sw: '0.22', glow: false }
  }

  function labelClass(input: ControllerInputDef, mapped: Mapping | undefined): string {
    const key    = inputKey(input)
    const active  = isInputActive(input, activeInputs)
    const hovered = hoveredKey === key
    if (active)  return 'border-yellow-500 bg-slate-950 text-yellow-400 font-semibold ring-1 ring-yellow-400/20 shadow-md'
    if (hovered) return mapped ? 'border-red-500 bg-slate-950 text-red-400 font-semibold ring-1 ring-red-400/20 shadow-md' : 'border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 hover:border-slate-400'
    if (mapped)  return 'border-blue-500/40 bg-slate-950 text-blue-400 font-semibold shadow-sm'
    return 'border-slate-200 bg-white/95 text-slate-500 hover:text-slate-800 shadow-sm hover:border-slate-300 hover:bg-white'
  }

  function renderInteractiveButton(
    input: ControllerInputDef,
    color: string,
    opacity: number,
    sw: string,
    glow: boolean,
    active: boolean,
    hovered: boolean,
    onClick: () => void,
    onMouseEnter: () => void,
    onMouseLeave: () => void
  ) {
    const bx = btnX(input)
    const by = input.y

    // Resolve size and coordinates in the 100x100 SVG viewbox
    const name = input.name
    let shape: ReactElement | null = null
    const isPlayStation = profile.id === 'playstation'

    if (name === 'L1' || name === 'R1') {
      const w = 10.6, h = 6.5, rx = 1, ry = 3
      shape = <rect x={bx - w/2} y={by - h/2} width={w} height={h} rx={rx} ry={ry} />
    } else if (name === 'L2' || name === 'R2') {
      const w = 10.6, h = 10.5, rx = 2, ry = 5
      shape = <rect x={bx - w/2} y={by - h/2} width={w} height={h} rx={rx} ry={ry} />
    } else if (name === 'A' || name === 'B' || name === 'X' || name === 'Y' || name === 'Square' || name === 'Circle' || name === 'Triangle' || name === 'Cross') {
      const rx = 1.75, ry = 4.5
      shape = <ellipse cx={bx} cy={by} rx={rx} ry={ry} />
    } else if (name === 'L3' || name === 'R3') {
      const rx = 2.25, ry = 6
      shape = <ellipse cx={bx} cy={by} rx={rx} ry={ry} />
    } else if (name === 'Select' || name === 'Start' || name === 'Share' || name === 'Options') {
      const w = isPlayStation ? 1.5 : 3
      const h = isPlayStation ? 6.15 : 3.5
      const rx = isPlayStation ? 0.5 : 1.0
      const ry = isPlayStation ? 1.5 : 1.75
      shape = <rect x={bx - w/2} y={by - h/2} width={w} height={h} rx={rx} ry={ry} />
    } else if (name === 'Home' || name === 'PS') {
      const rx = 1.5, ry = 3.85
      shape = <ellipse cx={bx} cy={by} rx={rx} ry={ry} />
    } else if (name === 'Touchpad' || name === 'PadPress') {
      const w = isPlayStation ? 19.5 : 12.0
      const h = isPlayStation ? 17.7 : 4.5
      const rx = 1.0
      const ry = 1.0
      shape = <rect x={bx - w/2} y={by - h/2} width={w} height={h} rx={rx} ry={ry} />
    } else {
      // D-Pad buttons
      const w = 2.5, h = 6, rx = 1.0
      shape = <rect x={bx - w/2} y={by - h/2} width={w} height={h} rx={rx} ry={rx} />
    }

    const fill = active
      ? 'rgba(250, 204, 21, 0.22)'
      : hovered
        ? 'rgba(59, 130, 246, 0.15)'
        : 'rgba(255, 255, 255, 0.02)'

    return (
      <g
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{ cursor: isPlaying ? 'default' : 'pointer' }}
        pointerEvents="visiblePainted"
      >
        {/* Glow Underlay Border */}
        {cloneElement(shape, {
          fill: fill,
          stroke: color,
          strokeWidth: (glow || active || hovered) ? 0.35 : 0.15,
          filter: (glow || active || hovered) ? 'url(#line-glow)' : 'none',
          opacity: (glow || active || hovered) ? 0.85 : 0.25,
        })}
        {/* Sharp Core Border */}
        {cloneElement(shape, {
          fill: 'none',
          stroke: color,
          strokeWidth: 0.12,
          opacity: (glow || active || hovered) ? 1.0 : 0.45,
        })}
      </g>
    )
  }

  return (
    <div className="flex-1 flex flex-row overflow-hidden select-none bg-slate-50 text-slate-800">

      {/* ── Main area: controller + joystick pads ────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-2 overflow-hidden">

        {/* Controller image + guide lines */}
        <div className="relative w-full" style={{ maxWidth: '780px', aspectRatio: '100/39' }}>
          <img
            src={profile.imageUrl}
            alt={profile.name}
            draggable={false}
            className="absolute pointer-events-none"
            style={{ left: `${IMG_LEFT}%`, width: `${IMG_WIDTH}%`, top: 0, height: '100%', objectFit: 'contain' }}
          />

          {/* SVG guide lines */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ zIndex: 1 }}
          >
            <defs>
              <filter id="line-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="0.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            {[
              ...leftLabels.map((l) => ({ ...l, side: 'left' as const })),
              ...rightLabels.map((l) => ({ ...l, side: 'right' as const })),
            ].map(({ input, labelY, side }) => {
              const mapped = findMapping(input, mappings)
              const key    = inputKey(input)
              const bx     = btnX(input)
              const by     = input.y
              const { color, opacity, sw, glow } = svgStyle(input, mapped)
              const hovered = hoveredKey === key
              const pts = side === 'left'
                ? `${LBL_L_X},${labelY} ${ELBOW_L_X},${labelY} ${bx},${by}`
                : `${bx},${by} ${ELBOW_R_X},${labelY} ${LBL_R_X},${labelY}`
              return (
                <g key={key} opacity={opacity}>
                  {/* Glow Underlay Line */}
                  {(glow || mapped) && (
                    <polyline
                      points={pts}
                      stroke={color}
                      strokeWidth={Number(sw) * 3}
                      opacity={glow ? 0.4 : 0.15}
                      fill="none"
                      strokeLinejoin="round"
                      filter="url(#line-glow)"
                      pointerEvents="none"
                    />
                  )}
                  {/* Sharp Core Line */}
                  <polyline points={pts} stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" pointerEvents="none" />
                  
                  {/* Precision Interactive Controller Button Shape */}
                  {renderInteractiveButton(
                    input,
                    color,
                    opacity,
                    sw,
                    glow || false,
                    isInputActive(input, activeInputs),
                    hovered,
                    () => {
                      if (isPlaying) return
                      if (mapped) onDeleteMapping(mapped)
                      else onAddMapping(toCaptureResult(input))
                    },
                    () => setHoveredKey(key),
                    () => setHoveredKey(null)
                  )}

                  {/* Wide transparent interactive line for easier hovering */}
                  <polyline
                    points={pts}
                    stroke="transparent"
                    strokeWidth="3.5"
                    fill="none"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredKey(key)}
                    onMouseLeave={() => setHoveredKey(null)}
                  />
                </g>
              )
            })}

            {/* SVG guide lines for central buttons (pointing straight up) */}
            {centralInputs.map((input) => {
              const mapped = findMapping(input, mappings)
              const key    = inputKey(input)
              const bx     = btnX(input)
              const by     = input.y
              const { color, opacity, sw, glow } = svgStyle(input, mapped)
              const hovered = hoveredKey === key
              
              // Spaced badge X positions to prevent overlap: Select at 34%, Home at 50%, Start at 66%
              let badgeX = 50
              if (input.name === 'Select') badgeX = 34
              if (input.name === 'Start')  badgeX = 66
              
              const labelY = 4.0
              const pts = `${badgeX},${labelY} ${bx},${by}`
              return (
                <g key={key} opacity={opacity}>
                  {/* Glow Underlay Line */}
                  {(glow || mapped) && (
                    <polyline
                      points={pts}
                      stroke={color}
                      strokeWidth={Number(sw) * 3}
                      opacity={glow ? 0.4 : 0.15}
                      fill="none"
                      filter="url(#line-glow)"
                      pointerEvents="none"
                    />
                  )}
                  {/* Sharp Core Line */}
                  <polyline points={pts} stroke={color} strokeWidth={sw} fill="none" pointerEvents="none" />
                  
                  {/* Precision Interactive Controller Button Shape */}
                  {renderInteractiveButton(
                    input,
                    color,
                    opacity,
                    sw,
                    glow || false,
                    isInputActive(input, activeInputs),
                    hovered,
                    () => {
                      if (isPlaying) return
                      if (mapped) onDeleteMapping(mapped)
                      else onAddMapping(toCaptureResult(input))
                    },
                    () => setHoveredKey(key),
                    () => setHoveredKey(null)
                  )}

                  {/* Wide transparent interactive line */}
                  <polyline
                    points={pts}
                    stroke="transparent"
                    strokeWidth="3.5"
                    fill="none"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredKey(key)}
                    onMouseLeave={() => setHoveredKey(null)}
                  />
                </g>
              )
            })}
          </svg>

          {/* Left labels */}
          {leftLabels.map(({ input, labelY }) => {
            const mapped = findMapping(input, mappings)
            const key    = inputKey(input)
            const active = isInputActive(input, activeInputs)
            const hovered = hoveredKey === key
            return (
              <div
                key={key}
                className="absolute transition-all duration-150"
                style={{ right: `${100 - LBL_L_X}%`, top: `${labelY}%`, transform: 'translateY(-50%)', zIndex: hovered ? 10 : 2 }}
              >
                <button
                  disabled={isPlaying}
                  title={mapped ? `${input.name} → ${mapped.key_combo} (clique para remover)` : `Mapear ${input.name}`}
                  onClick={() => { if (isPlaying) return; if (mapped) onDeleteMapping(mapped); else onAddMapping(toCaptureResult(input)) }}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={[
                    'flex items-center gap-2 text-[11px] font-mono whitespace-nowrap',
                    'rounded-md border px-1.5 py-[2.5px] shadow-sm transition-all duration-150 disabled:opacity-40 backdrop-blur-md',
                    labelClass(input, mapped),
                    hovered ? 'scale-105 shadow-md' : 'scale-100',
                  ].join(' ')}
                >
                  {/* Mapped Key / Keycap */}
                  <span
                    className={[
                      'px-1.5 py-0.5 rounded text-[9px] font-sans font-bold shadow-sm transition-all',
                      mapped
                        ? hovered
                          ? 'bg-red-500 border border-red-600 text-white'
                          : active
                            ? 'bg-yellow-500 border border-yellow-600 text-slate-950 font-extrabold'
                            : 'bg-blue-500 border border-blue-600 text-white'
                        : active
                          ? 'bg-yellow-500 border border-yellow-600 text-slate-950 font-extrabold'
                          : 'bg-slate-100 border border-slate-200 text-slate-500 shadow-inner font-semibold',
                    ].join(' ')}
                  >
                    {mapped ? mapped.key_combo.toUpperCase() : 'LIVRE'}
                  </span>

                  {/* Separator / Direction Indicator */}
                  <span
                    className={[
                      'text-[9px] transition-colors',
                      hovered && mapped ? 'text-red-400 font-bold' : active ? 'text-yellow-400' : mapped ? 'text-blue-400/70' : 'text-slate-300',
                    ].join(' ')}
                  >
                    {hovered && mapped ? '✕' : '◂'}
                  </span>

                  {/* Controller Button Label */}
                  <span
                    className={[
                      'font-sans text-[11px] font-medium tracking-wide pr-1 transition-colors',
                      active ? 'text-yellow-400 font-bold' : hovered ? (mapped ? 'text-slate-100' : 'text-slate-800') : mapped ? 'text-blue-400' : 'text-slate-500',
                    ].join(' ')}
                  >
                    {input.name}
                  </span>
                </button>
              </div>
            )
          })}

          {/* Right labels */}
          {rightLabels.map(({ input, labelY }) => {
            const mapped = findMapping(input, mappings)
            const key    = inputKey(input)
            const active = isInputActive(input, activeInputs)
            const hovered = hoveredKey === key
            return (
              <div
                key={key}
                className="absolute transition-all duration-150"
                style={{ left: `${LBL_R_X}%`, top: `${labelY}%`, transform: 'translateY(-50%)', zIndex: hovered ? 10 : 2 }}
              >
                <button
                  disabled={isPlaying}
                  title={mapped ? `${input.name} → ${mapped.key_combo} (clique para remover)` : `Mapear ${input.name}`}
                  onClick={() => { if (isPlaying) return; if (mapped) onDeleteMapping(mapped); else onAddMapping(toCaptureResult(input)) }}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={[
                    'flex items-center gap-2 text-[11px] font-mono whitespace-nowrap',
                    'rounded-md border px-1.5 py-[2.5px] shadow-sm transition-all duration-150 disabled:opacity-40 backdrop-blur-md',
                    labelClass(input, mapped),
                    hovered ? 'scale-105 shadow-md' : 'scale-100',
                  ].join(' ')}
                >
                  {/* Controller Button Label */}
                  <span
                    className={[
                      'font-sans text-[11px] font-medium tracking-wide pl-1 transition-colors',
                      active ? 'text-yellow-400 font-bold' : hovered ? (mapped ? 'text-slate-100' : 'text-slate-800') : mapped ? 'text-blue-400' : 'text-slate-500',
                    ].join(' ')}
                  >
                    {input.name}
                  </span>

                  {/* Separator / Direction Indicator */}
                  <span
                    className={[
                      'text-[9px] transition-colors',
                      hovered && mapped ? 'text-red-400 font-bold' : active ? 'text-yellow-400' : mapped ? 'text-blue-400/70' : 'text-slate-300',
                    ].join(' ')}
                  >
                    {hovered && mapped ? '✕' : '▸'}
                  </span>

                  {/* Mapped Key / Keycap */}
                  <span
                    className={[
                      'px-1.5 py-0.5 rounded text-[9px] font-sans font-bold shadow-sm transition-all',
                      mapped
                        ? hovered
                          ? 'bg-red-500 border border-red-600 text-white'
                          : active
                            ? 'bg-yellow-500 border border-yellow-600 text-slate-950 font-extrabold'
                            : 'bg-blue-500 border border-blue-600 text-white'
                        : active
                          ? 'bg-yellow-500 border border-yellow-600 text-slate-950 font-extrabold'
                          : 'bg-slate-100 border border-slate-200 text-slate-500 shadow-inner font-semibold',
                    ].join(' ')}
                  >
                    {mapped ? mapped.key_combo.toUpperCase() : 'LIVRE'}
                  </span>
                </button>
              </div>
            )
          })}

          {/* Top labels (for the 3 central buttons) */}
          {centralInputs.map((input) => {
            const mapped = findMapping(input, mappings)
            const key    = inputKey(input)
            const active = isInputActive(input, activeInputs)
            const hovered = hoveredKey === key
            
            // Spaced badge X positions to prevent overlap: Select at 34%, Home at 50%, Start at 66%
            let badgeX = 50
            if (input.name === 'Select') badgeX = 34
            if (input.name === 'Start')  badgeX = 66
            
            const labelY = 0.0
            const isLeftPattern = input.name === 'Select' || input.name === 'Home'
            return (
              <div
                key={key}
                className="absolute transition-all duration-150"
                style={{
                  left: `${badgeX}%`,
                  top: `${labelY}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: hovered ? 10 : 2,
                }}
              >
                <button
                  disabled={isPlaying}
                  title={mapped ? `${input.name} → ${mapped.key_combo} (clique para remover)` : `Mapear ${input.name}`}
                  onClick={() => { if (isPlaying) return; if (mapped) onDeleteMapping(mapped); else onAddMapping(toCaptureResult(input)) }}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={[
                    'flex items-center gap-2 text-[11px] font-mono whitespace-nowrap',
                    'rounded-md border px-1.5 py-[2.5px] shadow-sm transition-all duration-150 disabled:opacity-40 backdrop-blur-md',
                    labelClass(input, mapped),
                    hovered ? 'scale-105 shadow-md' : 'scale-100',
                  ].join(' ')}
                >
                  {isLeftPattern ? (
                    <>
                      {/* Mapped Key / Keycap */}
                      <span
                        className={[
                          'px-1.5 py-0.5 rounded text-[9px] font-sans font-bold shadow-sm transition-all',
                          mapped
                            ? hovered
                              ? 'bg-red-500 border border-red-600 text-white'
                              : active
                                ? 'bg-yellow-500 border border-yellow-600 text-slate-950 font-extrabold'
                                : 'bg-blue-500 border border-blue-600 text-white'
                            : active
                              ? 'bg-yellow-500 border border-yellow-600 text-slate-950 font-extrabold'
                              : 'bg-slate-100 border border-slate-200 text-slate-500 shadow-inner font-semibold',
                        ].join(' ')}
                      >
                        {mapped ? mapped.key_combo.toUpperCase() : 'LIVRE'}
                      </span>

                      {/* Separator */}
                      <span
                        className={[
                          'text-[9px] transition-colors',
                          hovered && mapped ? 'text-red-400 font-bold' : active ? 'text-yellow-400' : mapped ? 'text-blue-400/70' : 'text-slate-300',
                        ].join(' ')}
                      >
                        {hovered && mapped ? '✕' : '◂'}
                      </span>

                      {/* Controller Button Label */}
                      <span
                        className={[
                          'font-sans text-[11px] font-medium tracking-wide pr-1 transition-colors',
                          active ? 'text-yellow-400 font-bold' : hovered ? (mapped ? 'text-slate-100' : 'text-slate-800') : mapped ? 'text-blue-400' : 'text-slate-500',
                        ].join(' ')}
                      >
                        {input.name}
                      </span>
                    </>
                  ) : (
                    <>
                      {/* Controller Button Label */}
                      <span
                        className={[
                          'font-sans text-[11px] font-medium tracking-wide pl-1 transition-colors',
                          active ? 'text-yellow-400 font-bold' : hovered ? (mapped ? 'text-slate-100' : 'text-slate-800') : mapped ? 'text-blue-400' : 'text-slate-500',
                        ].join(' ')}
                      >
                        {input.name}
                      </span>

                      {/* Separator */}
                      <span
                        className={[
                          'text-[9px] transition-colors',
                          hovered && mapped ? 'text-red-400 font-bold' : active ? 'text-yellow-400' : mapped ? 'text-blue-400/70' : 'text-slate-300',
                        ].join(' ')}
                      >
                        {hovered && mapped ? '✕' : '▸'}
                      </span>

                      {/* Mapped Key / Keycap */}
                      <span
                        className={[
                          'px-1.5 py-0.5 rounded text-[9px] font-sans font-bold shadow-sm transition-all',
                          mapped
                            ? hovered
                              ? 'bg-red-500 border border-red-600 text-white'
                              : active
                                ? 'bg-yellow-500 border border-yellow-600 text-slate-950 font-extrabold'
                                : 'bg-blue-500 border border-blue-600 text-white'
                            : active
                              ? 'bg-yellow-500 border border-yellow-600 text-slate-950 font-extrabold'
                              : 'bg-slate-100 border border-slate-200 text-slate-500 shadow-inner font-semibold',
                        ].join(' ')}
                      >
                        {mapped ? mapped.key_combo.toUpperCase() : 'LIVRE'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Joystick pad visualizers */}
        {profile.sticks && profile.sticks.length > 0 && (
          <div className="flex mt-4 gap-16">
            {profile.sticks.map((stick) => {
              const angleCfg = angleMappings.find(
                (a) => a.axis_x === stick.axis_x && a.axis_y === stick.axis_y
              )
              const sectors = angleCfg
                ? computePadSectorsFromAngleMapping(angleCfg, axisValues[stick.axis_x] ?? 0, axisValues[stick.axis_y] ?? 0)
                : computePadSectors(stick, mappings, activeInputs)
              const deadzone = angleCfg ? angleCfg.deadzone : 0.5
              return (
                <JoystickPad
                  key={stick.name}
                  stick={stick}
                  axisX={axisValues[stick.axis_x] ?? 0}
                  axisY={axisValues[stick.axis_y] ?? 0}
                  sectors={sectors}
                  deadzone={deadzone}
                  onClick={isPlaying ? undefined : () => onEditAngleMapping(stick)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* ── Right panel: Chords + Axis mappings ──────────────────────────── */}
      <div className="w-56 border-l border-slate-200 flex flex-col p-3 gap-4 overflow-y-auto">

        {/* Acordes */}
        <div>
          <p className="text-[10px] text-slate-400 mb-2 font-semibold tracking-widest uppercase">Acordes</p>
          {chordMappings.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">Nenhum acorde.</p>
          ) : (
            <div className="space-y-1.5">
              {chordMappings.map((m, i) => {
                const label = [
                  resolveButtonName(profile, m.source_type, m.button_id, m.axis_direction || undefined),
                  ...(m.chord_inputs ?? []).map((c) =>
                    resolveButtonName(profile, c.type, c.button_id, c.axis_direction),
                  ),
                ].join(' + ')
                return (
                  <div key={i} className="card px-2 py-1.5 flex items-center gap-1.5 text-xs bg-white border border-slate-200 shadow-sm">
                    <span className="badge-ctrl text-[10px] flex-shrink-0 max-w-[80px] truncate">{label}</span>
                    <span className="text-slate-400 flex-shrink-0">▸</span>
                    <span className="badge-key text-[10px] flex-1 min-w-0 truncate">{m.key_combo}</span>
                    <button
                      onClick={() => !isPlaying && onDeleteMapping(m)}
                      disabled={isPlaying}
                      className="btn-ghost text-red-400 hover:text-red-600 text-xs disabled:opacity-40 flex-shrink-0"
                    >✕</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
