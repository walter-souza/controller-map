import type { ControllerInputDef, ControllerProfile, CaptureResult, Mapping } from '../../../shared/models'

// ── Layout constants (% of container) ─────────────────────────────────────────
// Container aspect ratio 100/39: image (400×260 = 20:13) fills its 60%-wide
// center band exactly → 60% × (13/20) = 39% height.
const IMG_LEFT   = 20   // image left edge (%)
const IMG_WIDTH  = 60   // image width (%)
const LBL_L_X    = 17   // right edge of left labels
const LBL_R_X    = 83   // left edge of right labels
const ELBOW_L_X  = 22   // elbow X for left guide lines (inside image left edge)
const ELBOW_R_X  = 78   // elbow X for right guide lines
const MIN_GAP    = 9    // minimum vertical spacing between stacked labels (%)
// Ellipse axes that appear circular in the non-square SVG viewBox (100×100 → 100:39)
const DOT_RX     = 0.38
const DOT_RY     = 0.98

interface Props {
  profile: ControllerProfile
  mappings: Mapping[]
  isPlaying: boolean
  activeInputs?: Set<string>
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

// Button position mapped to container-relative X (SVG viewBox 0-100)
function btnX(input: ControllerInputDef): number {
  return IMG_LEFT + input.x * (IMG_WIDTH / 100)
}

// Sort and spread labels vertically so they don't overlap
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

function lineColor(input: ControllerInputDef, mapped: Mapping | undefined, active: boolean): string {
  if (active)  return '#facc15' // yellow-400
  if (mapped)  return '#60a5fa' // blue-400
  return '#334155'              // slate-700 (subtle)
}

export default function VisualMappingView({
  profile, mappings, isPlaying, activeInputs = new Set(), onAddMapping, onDeleteMapping,
}: Props) {
  const leftLabels  = spreadLabels(profile.inputs.filter((i) => i.x < 50))
  const rightLabels = spreadLabels(profile.inputs.filter((i) => i.x >= 50))

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-2 overflow-hidden select-none">
      {/* ── Main container ─────────────────────────────────────────────────── */}
      <div className="relative w-full" style={{ maxWidth: '920px', aspectRatio: '100/39' }}>

        {/* Controller image — fills the IMG_LEFT..IMG_LEFT+IMG_WIDTH horizontal band */}
        <img
          src={profile.imageUrl}
          alt={profile.name}
          draggable={false}
          className="absolute pointer-events-none"
          style={{ left: `${IMG_LEFT}%`, width: `${IMG_WIDTH}%`, top: 0, height: '100%', objectFit: 'contain' }}
        />

        {/* ── SVG guide lines ─────────────────────────────────────────────── */}
        {/* viewBox 0 0 100 100 + preserveAspectRatio=none: SVG coords = % of container */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ zIndex: 1 }}
        >
          {leftLabels.map(({ input, labelY }) => {
            const mapped = findMapping(input, mappings)
            const active = isInputActive(input, activeInputs)
            const color  = lineColor(input, mapped, active)
            const bx     = btnX(input)
            const by     = input.y
            const op     = active ? 0.95 : mapped ? 0.65 : 0.3
            return (
              <g key={inputKey(input)} opacity={op}>
                {/* Elbow: label edge → horizontal to ELBOW_L_X → diagonal to button */}
                <polyline
                  points={`${LBL_L_X},${labelY} ${ELBOW_L_X},${labelY} ${bx},${by}`}
                  stroke={color} strokeWidth={active ? '0.45' : '0.28'}
                  fill="none" strokeLinejoin="round"
                />
                <ellipse cx={bx} cy={by} rx={DOT_RX} ry={DOT_RY} fill={color} />
              </g>
            )
          })}

          {rightLabels.map(({ input, labelY }) => {
            const mapped = findMapping(input, mappings)
            const active = isInputActive(input, activeInputs)
            const color  = lineColor(input, mapped, active)
            const bx     = btnX(input)
            const by     = input.y
            const op     = active ? 0.95 : mapped ? 0.65 : 0.3
            return (
              <g key={inputKey(input)} opacity={op}>
                {/* Elbow: button → horizontal at ELBOW_R_X → label edge */}
                <polyline
                  points={`${bx},${by} ${ELBOW_R_X},${labelY} ${LBL_R_X},${labelY}`}
                  stroke={color} strokeWidth={active ? '0.45' : '0.28'}
                  fill="none" strokeLinejoin="round"
                />
                <ellipse cx={bx} cy={by} rx={DOT_RX} ry={DOT_RY} fill={color} />
              </g>
            )
          })}
        </svg>

        {/* ── Left labels (right-aligned, button name closest to controller) ── */}
        {leftLabels.map(({ input, labelY }) => {
          const mapped = findMapping(input, mappings)
          const active = isInputActive(input, activeInputs)
          return (
            <div
              key={inputKey(input)}
              className="absolute"
              style={{ right: `${100 - LBL_L_X}%`, top: `${labelY}%`, transform: 'translateY(-50%)', zIndex: 2 }}
            >
              <button
                disabled={isPlaying}
                title={mapped ? `${input.name} → ${mapped.key_combo} (clique para remover)` : `Mapear ${input.name}`}
                onClick={() => { if (isPlaying) return; if (mapped) onDeleteMapping(mapped); else onAddMapping(toCaptureResult(input)) }}
                className={[
                  'flex items-center gap-1 text-[11px] font-mono whitespace-nowrap',
                  'rounded px-1 py-0.5 bg-slate-900/70',
                  'transition-colors duration-75 disabled:opacity-40',
                  active ? 'text-yellow-400'
                  : mapped ? 'text-blue-300 hover:text-red-400'
                  : 'text-slate-600 hover:text-slate-300',
                ].join(' ')}
              >
                {/* [key_combo] ◂ [name] — name is rightmost, closest to the controller */}
                <span className={mapped ? 'font-semibold' : 'opacity-35'}>{mapped ? mapped.key_combo : '+'}</span>
                <span className="opacity-35 text-[9px]">◂</span>
                <span className="opacity-55">{input.name}</span>
              </button>
            </div>
          )
        })}

        {/* ── Right labels (left-aligned, button name closest to controller) ─ */}
        {rightLabels.map(({ input, labelY }) => {
          const mapped = findMapping(input, mappings)
          const active = isInputActive(input, activeInputs)
          return (
            <div
              key={inputKey(input)}
              className="absolute"
              style={{ left: `${LBL_R_X}%`, top: `${labelY}%`, transform: 'translateY(-50%)', zIndex: 2 }}
            >
              <button
                disabled={isPlaying}
                title={mapped ? `${input.name} → ${mapped.key_combo} (clique para remover)` : `Mapear ${input.name}`}
                onClick={() => { if (isPlaying) return; if (mapped) onDeleteMapping(mapped); else onAddMapping(toCaptureResult(input)) }}
                className={[
                  'flex items-center gap-1 text-[11px] font-mono whitespace-nowrap',
                  'rounded px-1 py-0.5 bg-slate-900/70',
                  'transition-colors duration-75 disabled:opacity-40',
                  active ? 'text-yellow-400'
                  : mapped ? 'text-blue-300 hover:text-red-400'
                  : 'text-slate-600 hover:text-slate-300',
                ].join(' ')}
              >
                {/* [name] ▸ [key_combo] — name is leftmost, closest to the controller */}
                <span className="opacity-55">{input.name}</span>
                <span className="opacity-35 text-[9px]">▸</span>
                <span className={mapped ? 'font-semibold' : 'opacity-35'}>{mapped ? mapped.key_combo : '+'}</span>
              </button>
            </div>
          )
        })}
      </div>

      {/* ── Chord mappings list ──────────────────────────────────────────────── */}
      {mappings.some((m) => m.chord_inputs?.length) && (
        <div className="mt-3 w-full" style={{ maxWidth: '920px' }}>
          <p className="text-xs text-slate-400 mb-2 font-semibold">Acordes</p>
          <div className="space-y-1.5">
            {mappings
              .filter((m) => m.chord_inputs?.length)
              .map((m, i) => {
                const label = [m.button_name, ...(m.chord_inputs ?? []).map((c) => c.button_name)].join(' + ')
                return (
                  <div key={i} className="card px-3 py-2 flex items-center gap-2 text-xs">
                    <span className="badge-ctrl">{label}</span>
                    <span className="text-slate-300">──►</span>
                    <span className="badge-key">{m.key_combo}</span>
                    <div className="flex-1" />
                    <button
                      onClick={() => !isPlaying && onDeleteMapping(m)}
                      disabled={isPlaying}
                      className="btn-ghost text-red-400 hover:text-red-600 text-xs disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
