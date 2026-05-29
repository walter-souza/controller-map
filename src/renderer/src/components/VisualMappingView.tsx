import type { ControllerInputDef, ControllerProfile, CaptureResult, Mapping } from '../../../shared/models'

interface Props {
  profile: ControllerProfile
  mappings: Mapping[]
  isPlaying: boolean
  onAddMapping: (presetInput: CaptureResult) => void
  onDeleteMapping: (mapping: Mapping) => void
}

function findMapping(input: ControllerInputDef, mappings: Mapping[]): Mapping | undefined {
  return mappings.find((m) => {
    if (input.type === 'button') {
      return m.source_type === 'button' && m.button_id === input.id && !m.chord_inputs?.length
    }
    // axis: match axis_id and direction
    return m.source_type === 'axis' && m.button_id === input.axis_id && m.axis_direction === input.direction && !m.chord_inputs?.length
  })
}

function toCaptureResult(input: ControllerInputDef): CaptureResult {
  if (input.type === 'button') {
    return { type: 'button', button_id: input.id, button_name: input.name }
  }
  return { type: 'axis', button_id: input.axis_id, button_name: input.name, axis_direction: input.direction }
}

export default function VisualMappingView({ profile, mappings, isPlaying, onAddMapping, onDeleteMapping }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden select-none">
      {/* Controller image container — badges positioned absolutely over it */}
      <div className="relative w-full max-w-xl" style={{ aspectRatio: '400/260' }}>
        <img
          src={profile.imageUrl}
          alt={profile.name}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          draggable={false}
        />

        {profile.inputs.map((input) => {
          const mapped = findMapping(input, mappings)
          const key = input.type === 'button' ? `btn-${input.id}` : `axis-${input.axis_id}-${input.direction}`

          return (
            <div
              key={key}
              className="absolute"
              style={{
                left: `${input.x}%`,
                top: `${input.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {mapped ? (
                <button
                  onClick={() => !isPlaying && onDeleteMapping(mapped)}
                  disabled={isPlaying}
                  title={`${input.name} → ${mapped.key_combo} (clique para remover)`}
                  className="
                    px-2 py-0.5 rounded-full text-xs font-mono font-semibold
                    bg-blue-600 text-white border border-blue-400
                    hover:bg-red-600 hover:border-red-400 transition-colors
                    disabled:opacity-60 disabled:cursor-not-allowed
                    whitespace-nowrap shadow-lg
                  "
                >
                  {mapped.key_combo}
                </button>
              ) : (
                <button
                  onClick={() => !isPlaying && onAddMapping(toCaptureResult(input))}
                  disabled={isPlaying}
                  title={`Mapear ${input.name}`}
                  className="
                    w-6 h-6 rounded-full text-xs font-bold
                    bg-slate-700 text-slate-300 border border-slate-500
                    hover:bg-slate-500 hover:text-white transition-colors
                    disabled:opacity-30 disabled:cursor-not-allowed
                    shadow-md flex items-center justify-center
                  "
                >
                  +
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Chord mappings list below (chord mappings aren't shown on the visual) */}
      {mappings.some((m) => m.chord_inputs?.length) && (
        <div className="mt-4 w-full max-w-xl">
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
