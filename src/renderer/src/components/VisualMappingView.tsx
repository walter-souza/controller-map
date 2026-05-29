import { memo, useState } from 'react'
import type { ControllerAxisDef, ControllerInputDef, ControllerProfile, CaptureResult, Mapping, StickDef } from '../../../shared/models'

// ── Layout constants (% of container) ─────────────────────────────────────────
const IMG_LEFT   = 20
const IMG_WIDTH  = 60
const LBL_L_X    = 17
const LBL_R_X    = 83
const ELBOW_L_X  = 22
const ELBOW_R_X  = 78
const MIN_GAP    = 6
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
  isPlaying: boolean
  activeInputs?: Set<string>
  axisValues?: Record<number, number>
  onAddMapping: (presetInput: CaptureResult) => void
  onDeleteMapping: (mapping: Mapping) => void
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

function sectorPath(startDeg: number, endDeg: number): string {
  const s = degToRad(startDeg)
  const e = degToRad(endDeg)
  const x1 = PAD_CX + PAD_R * Math.cos(s)
  const y1 = PAD_CY + PAD_R * Math.sin(s)
  const x2 = PAD_CX + PAD_R * Math.cos(e)
  const y2 = PAD_CY + PAD_R * Math.sin(e)
  return `M ${PAD_CX} ${PAD_CY} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${PAD_R} ${PAD_R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
}

// Precomputed sector SVG paths (pie slices: 315°→45°=right, 45°→135°=down, etc.)
const SECTOR = {
  up:    sectorPath(225, 315),
  right: sectorPath(315, 405), // 405 = 45° but crossing 0° — equivalent to sectorPath(315→45)
  down:  sectorPath(45, 135),
  left:  sectorPath(135, 225),
}

// ── JoystickPad component ─────────────────────────────────────────────────────
interface PadProps {
  stick: StickDef
  axisX: number
  axisY: number
  isUpActive: boolean
  isDownActive: boolean
  isLeftActive: boolean
  isRightActive: boolean
  isMappedUp: boolean
  isMappedDown: boolean
  isMappedLeft: boolean
  isMappedRight: boolean
}

const JoystickPad = memo(function JoystickPad({
  stick, axisX, axisY,
  isUpActive, isDownActive, isLeftActive, isRightActive,
  isMappedUp, isMappedDown, isMappedLeft, isMappedRight,
}: PadProps) {
  const dx = Math.abs(axisX) < PAD_DEADZONE ? 0 : Math.max(-1, Math.min(1, axisX))
  const dy = Math.abs(axisY) < PAD_DEADZONE ? 0 : Math.max(-1, Math.min(1, axisY))
  const dotX = PAD_CX + dx * PAD_R * 0.82
  const dotY = PAD_CY + dy * PAD_R * 0.82
  const anyActive = isUpActive || isDownActive || isLeftActive || isRightActive

  function sectorFill(active: boolean, mapped: boolean): string {
    if (active) return 'rgba(250,204,21,0.45)'
    if (mapped) return 'rgba(96,165,250,0.15)'
    return 'transparent'
  }

  // Diagonal crosshair endpoints (at 45° inside the circle)
  const d45 = (PAD_R / Math.SQRT2).toFixed(2)

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" viewBox="0 0 90 90">
        {/* Background circle */}
        <circle cx={PAD_CX} cy={PAD_CY} r={PAD_R + 4} fill="#1e293b" stroke="#334155" strokeWidth="1" />
        {/* Sectors */}
        <path d={SECTOR.up}    fill={sectorFill(isUpActive,    isMappedUp)}    />
        <path d={SECTOR.right} fill={sectorFill(isRightActive, isMappedRight)} />
        <path d={SECTOR.down}  fill={sectorFill(isDownActive,  isMappedDown)}  />
        <path d={SECTOR.left}  fill={sectorFill(isLeftActive,  isMappedLeft)}  />
        {/* Outer ring */}
        <circle cx={PAD_CX} cy={PAD_CY} r={PAD_R} fill="none" stroke="#475569" strokeWidth="0.8" />
        {/* H+V crosshair */}
        <line x1={PAD_CX - PAD_R} y1={PAD_CY} x2={PAD_CX + PAD_R} y2={PAD_CY} stroke="#475569" strokeWidth="0.5" opacity="0.4" />
        <line x1={PAD_CX} y1={PAD_CY - PAD_R} x2={PAD_CX} y2={PAD_CY + PAD_R} stroke="#475569" strokeWidth="0.5" opacity="0.4" />
        {/* Diagonal sector dividers */}
        <line x1={PAD_CX - +d45} y1={PAD_CY - +d45} x2={PAD_CX + +d45} y2={PAD_CY + +d45} stroke="#475569" strokeWidth="0.5" opacity="0.4" />
        <line x1={PAD_CX + +d45} y1={PAD_CY - +d45} x2={PAD_CX - +d45} y2={PAD_CY + +d45} stroke="#475569" strokeWidth="0.5" opacity="0.4" />
        {/* Dot shadow + dot */}
        <circle cx={dotX} cy={dotY} r={5.5} fill="rgba(0,0,0,0.5)" />
        <circle cx={dotX} cy={dotY} r={4.5} fill={anyActive ? '#facc15' : '#94a3b8'} />
      </svg>
      <span className="text-[10px] text-slate-400 font-mono">{stick.name}</span>
    </div>
  )
})

// ── Main component ────────────────────────────────────────────────────────────
export default function VisualMappingView({
  profile, mappings, isPlaying, activeInputs = new Set(), axisValues = {}, onAddMapping, onDeleteMapping,
}: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  // Axes that belong to defined sticks — excluded from guide lines (shown as pad visualizers)
  const stickAxisIds = new Set(
    (profile.sticks ?? []).flatMap((s) => [s.axis_x, s.axis_y])
  )
  const guideInputs = profile.inputs.filter(
    (i) => i.type === 'button' || !stickAxisIds.has((i as ControllerAxisDef).axis_id)
  )

  const leftLabels  = spreadLabels(guideInputs.filter((i) => i.x < 50))
  const rightLabels = spreadLabels(guideInputs.filter((i) => i.x >= 50))
  const chordMappings = mappings.filter((m) => m.chord_inputs?.length)

  // ── SVG style helpers ───────────────────────────────────────────────────────
  function svgStyle(input: ControllerInputDef, mapped: Mapping | undefined) {
    const key    = inputKey(input)
    const active  = isInputActive(input, activeInputs)
    const hovered = hoveredKey === key
    if (active)  return { color: '#facc15', opacity: 0.95, sw: '0.5' }
    if (hovered) return { color: mapped ? '#93c5fd' : '#94a3b8', opacity: 0.95, sw: '0.5' }
    if (mapped)  return { color: '#60a5fa', opacity: 0.65, sw: '0.28' }
    return { color: '#334155', opacity: 0.3, sw: '0.28' }
  }

  function labelClass(input: ControllerInputDef, mapped: Mapping | undefined): string {
    const key    = inputKey(input)
    const active  = isInputActive(input, activeInputs)
    const hovered = hoveredKey === key
    if (active)  return 'text-yellow-400'
    if (hovered) return mapped ? 'text-blue-200' : 'text-slate-200'
    if (mapped)  return 'text-blue-300 hover:text-red-400'
    return 'text-slate-400 hover:text-slate-100'
  }

  return (
    <div className="flex-1 flex flex-row overflow-hidden select-none">

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
            {[
              ...leftLabels.map((l) => ({ ...l, side: 'left' as const })),
              ...rightLabels.map((l) => ({ ...l, side: 'right' as const })),
            ].map(({ input, labelY, side }) => {
              const mapped = findMapping(input, mappings)
              const key    = inputKey(input)
              const bx     = btnX(input)
              const by     = input.y
              const { color, opacity, sw } = svgStyle(input, mapped)
              const pts = side === 'left'
                ? `${LBL_L_X},${labelY} ${ELBOW_L_X},${labelY} ${bx},${by}`
                : `${bx},${by} ${ELBOW_R_X},${labelY} ${LBL_R_X},${labelY}`
              return (
                <g key={key} opacity={opacity}>
                  <polyline points={pts} stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" pointerEvents="none" />
                  {input.type === 'axis'
                    ? <polygon points={`${bx},${by - DOT_RY} ${bx + DOT_RX * 1.3},${by} ${bx},${by + DOT_RY} ${bx - DOT_RX * 1.3},${by}`} fill={color} pointerEvents="none" />
                    : <ellipse cx={bx} cy={by} rx={DOT_RX} ry={DOT_RY} fill={color} pointerEvents="none" />
                  }
                  <polyline
                    points={pts}
                    stroke="transparent"
                    strokeWidth="3"
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
            return (
              <div
                key={key}
                className="absolute"
                style={{ right: `${100 - LBL_L_X}%`, top: `${labelY}%`, transform: 'translateY(-50%)', zIndex: 2 }}
              >
                <button
                  disabled={isPlaying}
                  title={mapped ? `${input.name} → ${mapped.key_combo} (clique para remover)` : `Mapear ${input.name}`}
                  onClick={() => { if (isPlaying) return; if (mapped) onDeleteMapping(mapped); else onAddMapping(toCaptureResult(input)) }}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={[
                    'flex items-center gap-1 text-[11px] font-mono whitespace-nowrap',
                    'rounded px-1 py-0.5 bg-slate-900/70',
                    'transition-colors duration-75 disabled:opacity-40',
                    labelClass(input, mapped),
                  ].join(' ')}
                >
                  <span className={mapped ? 'font-semibold' : 'text-slate-500'}>{mapped ? mapped.key_combo : '+'}</span>
                  <span className="opacity-40 text-[9px]">◂</span>
                  <span>{input.name}</span>
                </button>
              </div>
            )
          })}

          {/* Right labels */}
          {rightLabels.map(({ input, labelY }) => {
            const mapped = findMapping(input, mappings)
            const key    = inputKey(input)
            return (
              <div
                key={key}
                className="absolute"
                style={{ left: `${LBL_R_X}%`, top: `${labelY}%`, transform: 'translateY(-50%)', zIndex: 2 }}
              >
                <button
                  disabled={isPlaying}
                  title={mapped ? `${input.name} → ${mapped.key_combo} (clique para remover)` : `Mapear ${input.name}`}
                  onClick={() => { if (isPlaying) return; if (mapped) onDeleteMapping(mapped); else onAddMapping(toCaptureResult(input)) }}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={[
                    'flex items-center gap-1 text-[11px] font-mono whitespace-nowrap',
                    'rounded px-1 py-0.5 bg-slate-900/70',
                    'transition-colors duration-75 disabled:opacity-40',
                    labelClass(input, mapped),
                  ].join(' ')}
                >
                  <span>{input.name}</span>
                  <span className="opacity-40 text-[9px]">▸</span>
                  <span className={mapped ? 'font-semibold' : 'text-slate-500'}>{mapped ? mapped.key_combo : '+'}</span>
                </button>
              </div>
            )
          })}
        </div>

        {/* Joystick pad visualizers */}
        {profile.sticks && profile.sticks.length > 0 && (
          <div className="flex mt-4 gap-16">
            {profile.sticks.map((stick) => (
              <JoystickPad
                key={stick.name}
                stick={stick}
                axisX={axisValues[stick.axis_x] ?? 0}
                axisY={axisValues[stick.axis_y] ?? 0}
                isUpActive={activeInputs.has(`a:${stick.axis_y}:-1`)}
                isDownActive={activeInputs.has(`a:${stick.axis_y}:1`)}
                isLeftActive={activeInputs.has(`a:${stick.axis_x}:-1`)}
                isRightActive={activeInputs.has(`a:${stick.axis_x}:1`)}
                isMappedUp={isAxisMapped(stick.axis_y, -1, mappings)}
                isMappedDown={isAxisMapped(stick.axis_y, 1, mappings)}
                isMappedLeft={isAxisMapped(stick.axis_x, -1, mappings)}
                isMappedRight={isAxisMapped(stick.axis_x, 1, mappings)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel: Chords + Axis mappings ──────────────────────────── */}
      <div className="w-56 border-l border-slate-700/50 flex flex-col p-3 gap-4 overflow-y-auto">

        {/* Acordes */}
        <div>
          <p className="text-[10px] text-slate-400 mb-2 font-semibold tracking-widest uppercase">Acordes</p>
          {chordMappings.length === 0 ? (
            <p className="text-[11px] text-slate-600 italic">Nenhum acorde.</p>
          ) : (
            <div className="space-y-1.5">
              {chordMappings.map((m, i) => {
                const label = [m.button_name, ...(m.chord_inputs ?? []).map((c) => c.button_name)].join(' + ')
                return (
                  <div key={i} className="card px-2 py-1.5 flex items-center gap-1.5 text-xs">
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

        {/* Analógicos */}
        {profile.sticks && profile.sticks.length > 0 && (
          <div>
            <p className="text-[10px] text-slate-400 mb-2 font-semibold tracking-widest uppercase">Analógicos</p>
            <div className="space-y-3">
              {profile.sticks.map((stick) => {
                const stickInputs = profile.inputs.filter(
                  (i): i is ControllerAxisDef =>
                    i.type === 'axis' && (i.axis_id === stick.axis_x || i.axis_id === stick.axis_y)
                )
                return (
                  <div key={stick.name}>
                    <p className="text-[10px] text-slate-500 mb-1 font-mono">{stick.name}</p>
                    <div className="space-y-0.5">
                      {stickInputs.map((input) => {
                        const mapped = findMapping(input, mappings)
                        const active = isInputActive(input, activeInputs)
                        const arrow  = input.name.slice(-1)
                        return (
                          <div
                            key={inputKey(input)}
                            className={[
                              'flex items-center gap-1.5 text-xs rounded px-1.5 py-1 transition-colors',
                              active ? 'bg-yellow-400/10' : 'hover:bg-slate-800/60',
                            ].join(' ')}
                          >
                            <span className="text-slate-300 w-4 text-center font-mono">{arrow}</span>
                            {mapped ? (
                              <>
                                <span className="badge-key text-[10px] flex-1 min-w-0 truncate">{mapped.key_combo}</span>
                                <button
                                  onClick={() => !isPlaying && onDeleteMapping(mapped)}
                                  disabled={isPlaying}
                                  className="btn-ghost text-red-400 hover:text-red-600 text-[10px] disabled:opacity-40 flex-shrink-0"
                                >✕</button>
                              </>
                            ) : (
                              <button
                                onClick={() => !isPlaying && onAddMapping(toCaptureResult(input))}
                                disabled={isPlaying}
                                className="text-slate-600 hover:text-slate-300 text-[10px] disabled:opacity-40"
                              >+ mapear</button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
