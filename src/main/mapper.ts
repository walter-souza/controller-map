/**
 * Mapper — polls joystick state and fires key combos.
 *
 * Ported from src/mapper.py. Runs on a setInterval(16) tick in the main process.
 * No separate thread needed — Node.js event loop handles timing.
 */

import type { AngleMappingConfig, ChordInput, Mapping } from '../shared/models'
import { controllerService } from './controller-service'
import { keyboardService } from './keyboard-service'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sdl = require('@kmamal/sdl') as typeof import('@kmamal/sdl')
type JoystickInstance = ReturnType<typeof sdl.joystick.openDevice>

const AXIS_THRESHOLD = 0.5
const AXIS_DEADZONE = 0.15
// Grace window for chord detection: if a button that belongs to a chord is pressed,
// we wait up to this many ms before firing its individual mapping.
// This allows the other chord button(s) to arrive without triggering individual mappings first.
const CHORD_GRACE_MS = 50

interface AxisMapping {
  mappings: Mapping[]
}

interface ButtonMapping {
  mapping: Mapping
}

// Canonical input descriptor used for chord matching and hold-key generation
interface ChordInputNorm {
  type: 'button' | 'axis'
  id: number
  dir: number  // 0 for buttons
}

interface ChordMappingEntry {
  holdKey: string            // unique canonical key for hold-repeat tracking
  inputs: ChordInputNorm[]   // sorted: all inputs that must be active simultaneously
  mapping: Mapping
}

export class Mapper {
  private _deviceId: number
  private _onDisconnect: (() => void) | undefined
  private _initialDelay: number  // seconds
  private _repeatInterval: number // seconds

  private _isActive = false
  private _joystick: JoystickInstance | null = null
  private _tickInterval: ReturnType<typeof setInterval> | null = null

  // Per-button/axis state
  private _buttonMappings = new Map<number, ButtonMapping>()
  private _axisMappings = new Map<number, AxisMapping>()
  private _diagonalMappings: Mapping[] = []
  private _angleMappings: AngleMappingConfig[] = []
  private _chordMappings: ChordMappingEntry[] = []
  // Button IDs that appear in any chord — these are skipped by event-driven handler
  // so chord logic (polling-based) has priority and prevents double-fires
  private _chordButtonIds = new Set<number>()

  // Hold-repeat tracking
  private _heldKeys = new Set<string>()        // composite key string
  private _pressTime = new Map<string, number>() // ms since epoch
  private _lastFire = new Map<string, number>()  // ms since epoch
  // Axis state: last active direction per axis
  private _axisState = new Map<number, number>()
  // Angle mapping: configId → current active regionId
  private _angleHeld = new Map<string, string>()
  // Chord grace window: buttons that belong to a chord and were just pressed, pending fire
  // Maps buttonId → timestamp when first detected pressed (ms)
  private _pendingChordButtons = new Map<number, number>()

  constructor(
    deviceId: number,
    mappings: Mapping[],
    onDisconnect?: () => void,
    initialDelay = 0.4,
    repeatInterval = 0.05,
    angleMappings: AngleMappingConfig[] = [],
  ) {
    this._deviceId = deviceId
    this._onDisconnect = onDisconnect
    this._initialDelay = initialDelay
    this._repeatInterval = repeatInterval
    this._angleMappings = angleMappings
    this._buildMappings(mappings)
  }

  get isActive(): boolean {
    return this._isActive
  }

  start(): void {
    if (this._isActive) return
    this._joystick = controllerService.openJoystick(this._deviceId)
    if (!this._joystick) return
    this._isActive = true

    // Event-driven button handling: fire first press immediately (zero latency)
    this._joystick.on('buttonDown', this._onButtonDown)
    this._joystick.on('buttonUp', this._onButtonUp)

    // 4ms tick for hold-repeat and axis/angle polling
    this._tickInterval = setInterval(() => this._tick(), 4)
  }

  stop(): void {
    if (this._tickInterval !== null) {
      clearInterval(this._tickInterval)
      this._tickInterval = null
    }
    if (this._joystick) {
      this._joystick.off('buttonDown', this._onButtonDown)
      this._joystick.off('buttonUp', this._onButtonUp)
      controllerService.closeJoystick(this._joystick)
      this._joystick = null
    }
    this._isActive = false
    this._heldKeys.clear()
    this._pressTime.clear()
    this._lastFire.clear()
    this._axisState.clear()
    this._angleHeld.clear()
    this._pendingChordButtons.clear()
  }

  // Immediately fires on SDL buttonDown event — no polling lag
  private _onButtonDown = (event: { button: number }) => {
    const entry = this._buttonMappings.get(event.button)
    if (!entry) return
    // If this button is part of any chord, skip event-driven handling.
    // Polling in _processButtons (after _processChords) will manage priority.
    if (this._chordButtonIds.has(event.button)) return
    const key = `btn:${event.button}`
    if (this._heldKeys.has(key)) return // already tracked (shouldn't happen)
    const now = Date.now()
    this._heldKeys.add(key)
    this._pressTime.set(key, now)
    this._lastFire.set(key, now)
    keyboardService.pressCombo(entry.mapping.key_combo).catch(() => {})
  }

  private _onButtonUp = (event: { button: number }) => {
    const key = `btn:${event.button}`
    this._heldKeys.delete(key)
    this._pressTime.delete(key)
    this._lastFire.delete(key)
  }

  private _buildMappings(mappings: Mapping[]): void {
    this._buttonMappings.clear()
    this._axisMappings.clear()
    this._diagonalMappings = []
    this._chordMappings = []
    this._chordButtonIds.clear()

    for (const m of mappings) {
      if (m.chord_inputs && m.chord_inputs.length > 0) {
        // Build a canonical sorted input list: primary + extras
        const primary: ChordInputNorm = {
          type: m.source_type as 'button' | 'axis',
          id: m.button_id,
          dir: m.axis_direction,
        }
        const extras: ChordInputNorm[] = m.chord_inputs.map((c: ChordInput) => ({
          type: c.type,
          id: c.button_id,
          dir: c.axis_direction ?? 0,
        }))
        const inputs = [primary, ...extras].sort(
          (a, b) => a.type.localeCompare(b.type) || a.id - b.id || a.dir - b.dir,
        )
        const holdKey = 'chord:' + inputs.map((i) => `${i.type}:${i.id}:${i.dir}`).join('+')
        this._chordMappings.push({ holdKey, inputs, mapping: m })
        // Track all button IDs in this chord so event-driven handler can skip them
        inputs.filter((i) => i.type === 'button').forEach((i) => this._chordButtonIds.add(i.id))
      } else if (m.source_type === 'button') {
        this._buttonMappings.set(m.button_id, { mapping: m })
      } else if (m.source_type === 'axis') {
        const existing = this._axisMappings.get(m.button_id)
        if (existing) {
          existing.mappings.push(m)
        } else {
          this._axisMappings.set(m.button_id, { mappings: [m] })
        }
      } else if (m.source_type === 'diagonal') {
        this._diagonalMappings.push(m)
      }
    }
  }

  private _tick(): void {
    controllerService.pollEvents()

    // Chords are processed first; they return suppressed button IDs so single-button
    // mappings don't double-fire when the button is part of an active chord.
    const suppressedButtons = this._processChords()
    this._processButtons(suppressedButtons)
    this._processAxes()
    this._processDiagonals()
    this._processAngleMappings()
  }

  // Returns the set of button IDs consumed by at least one fully-active chord.
  private _processChords(): Set<number> {
    const suppressed = new Set<number>()
    if (!this._joystick) return suppressed

    for (const entry of this._chordMappings) {
      const allActive = entry.inputs.every((input) => {
        if (input.type === 'button') {
          return this._joystick!.buttons[input.id] === true
        }
        const val = this._joystick!.axes[input.id] ?? 0
        return Math.abs(val) > AXIS_THRESHOLD && Math.sign(val) === input.dir
      })

      if (allActive) {
        // Suppress all button members of this chord from single-button processing
        entry.inputs.filter((i) => i.type === 'button').forEach((i) => suppressed.add(i.id))

        const k = entry.holdKey
        if (!this._heldKeys.has(k)) {
          const now = Date.now()
          this._heldKeys.add(k)
          this._pressTime.set(k, now)
          this._lastFire.set(k, now)
          // Cancel any pending individual fires for buttons in this chord
          entry.inputs.filter((i) => i.type === 'button').forEach((i) => this._pendingChordButtons.delete(i.id))
          keyboardService.pressCombo(entry.mapping.key_combo).catch(() => {})
        } else {
          const now = Date.now()
          const elapsed = (now - (this._pressTime.get(k) ?? now)) / 1000
          const sinceLast = (now - (this._lastFire.get(k) ?? now)) / 1000
          if (elapsed >= this._initialDelay && sinceLast >= this._repeatInterval) {
            this._lastFire.set(k, now)
            keyboardService.pressCombo(entry.mapping.key_combo).catch(() => {})
          }
        }
      } else if (this._heldKeys.has(entry.holdKey)) {
        this._heldKeys.delete(entry.holdKey)
        this._pressTime.delete(entry.holdKey)
        this._lastFire.delete(entry.holdKey)
      }
    }

    return suppressed
  }

  private _processButtons(suppressed: Set<number>): void {
    if (!this._joystick) return
    const buttons = this._joystick.buttons

    for (let btn = 0; btn < buttons.length; btn++) {
      const pressed = buttons[btn] ?? false

      if (suppressed.has(btn)) {
        // Active chord owns this button — cancel any pending individual fire
        this._pendingChordButtons.delete(btn)
        continue
      }

      const entry = this._buttonMappings.get(btn)
      if (!entry) continue

      const key = `btn:${btn}`

      if (pressed) {
        if (this._chordButtonIds.has(btn) && !this._heldKeys.has(key)) {
          // Button is part of a chord and hasn't fired individually yet — apply grace window
          if (!this._pendingChordButtons.has(btn)) {
            // First detection: start the grace window, don't fire yet
            this._pendingChordButtons.set(btn, Date.now())
            continue
          }
          const elapsed = Date.now() - this._pendingChordButtons.get(btn)!
          if (elapsed < CHORD_GRACE_MS) continue // still within grace window — keep waiting
          // Grace window expired with no chord — fire individual mapping now
          this._pendingChordButtons.delete(btn)
          // fall through to normal first-press handling below
        }

        if (!this._heldKeys.has(key)) {
          // First press (either non-chord button, or chord button after grace window expired)
          const now = Date.now()
          this._heldKeys.add(key)
          this._pressTime.set(key, now)
          this._lastFire.set(key, now)
          keyboardService.pressCombo(entry.mapping.key_combo).catch(() => {})
        } else {
          // Hold-repeat
          const now = Date.now()
          const pressedAt = this._pressTime.get(key) ?? now
          const lastFiredAt = this._lastFire.get(key) ?? now
          const elapsed = (now - pressedAt) / 1000
          const sinceLast = (now - lastFiredAt) / 1000
          if (elapsed >= this._initialDelay && sinceLast >= this._repeatInterval) {
            this._lastFire.set(key, now)
            keyboardService.pressCombo(entry.mapping.key_combo).catch(() => {})
          }
        }
      } else {
        // Button is released
        if (this._pendingChordButtons.has(btn)) {
          // Quick tap: pressed and released within grace window, no chord fired
          // Fire the individual mapping once so the input isn't lost
          this._pendingChordButtons.delete(btn)
          keyboardService.pressCombo(entry.mapping.key_combo).catch(() => {})
        } else if (this._heldKeys.has(key)) {
          this._heldKeys.delete(key)
          this._pressTime.delete(key)
          this._lastFire.delete(key)
        }
      }
    }
  }

  private _processAxes(): void {
    if (!this._joystick) return
    const axes = this._joystick.axes

    for (let axisId = 0; axisId < axes.length; axisId++) {
      const entries = this._axisMappings.get(axisId)
      if (!entries) continue

      const rawValue = axes[axisId] ?? 0

      for (const m of entries.mappings) {
        const key = `axis:${axisId}:${m.axis_direction}`
        const active =
          Math.abs(rawValue) > AXIS_THRESHOLD &&
          (rawValue > 0 ? m.axis_direction > 0 : m.axis_direction < 0)

        if (active) {
          this._handleHeld(key, m.key_combo)
        } else {
          const wasActive = this._axisState.get(axisId) === m.axis_direction
          if (wasActive && Math.abs(rawValue) < AXIS_DEADZONE) {
            this._heldKeys.delete(key)
            this._pressTime.delete(key)
            this._lastFire.delete(key)
            this._axisState.delete(axisId)
          }
        }
      }
    }
  }

  private _processDiagonals(): void {
    if (!this._joystick || this._diagonalMappings.length === 0) return
    const axes = this._joystick.axes

    for (const m of this._diagonalMappings) {
      if (m.axis_id_y === null) continue
      if (m.button_id >= axes.length || m.axis_id_y >= axes.length) continue

      const vx = axes[m.button_id] ?? 0
      const vy = axes[m.axis_id_y] ?? 0

      const xActive =
        Math.abs(vx) > AXIS_THRESHOLD &&
        (vx > 0 ? m.axis_direction > 0 : m.axis_direction < 0)
      const yActive =
        Math.abs(vy) > AXIS_THRESHOLD &&
        (vy > 0 ? m.axis_direction_y > 0 : m.axis_direction_y < 0)

      const key = `diag:${m.button_id}:${m.axis_direction}:${m.axis_id_y}:${m.axis_direction_y}`

      if (xActive && yActive) {
        this._handleHeld(key, m.key_combo)
      } else {
        const resting = Math.abs(vx) < AXIS_DEADZONE && Math.abs(vy) < AXIS_DEADZONE
        if (resting) {
          this._heldKeys.delete(key)
          this._pressTime.delete(key)
          this._lastFire.delete(key)
        }
      }
    }
  }

  private _processAngleMappings(): void {
    if (!this._joystick || this._angleMappings.length === 0) return
    const axes = this._joystick.axes

    for (const cfg of this._angleMappings) {
      const vx = axes[cfg.axis_x] ?? 0
      const vy = axes[cfg.axis_y] ?? 0
      const magnitude = Math.sqrt(vx * vx + vy * vy)
      const stateKey = `angle_cfg:${cfg.id}`

      if (magnitude < cfg.deadzone) {
        // Outside deadzone — release held key
        if (this._angleHeld.has(cfg.id)) {
          this._heldKeys.delete(stateKey)
          this._pressTime.delete(stateKey)
          this._lastFire.delete(stateKey)
          this._angleHeld.delete(cfg.id)
        }
        continue
      }

      // SDL Y axis positive=down; negate so 90°=up matches visual circle
      const angleDeg = ((Math.atan2(-vy, vx) * 180) / Math.PI + 360) % 360
      const region = _findAngleRegion(cfg, angleDeg)
      if (!region || !region.key_combo) continue

      const prevRegionId = this._angleHeld.get(cfg.id)
      if (prevRegionId !== region.id) {
        // Region changed — reset hold state
        this._heldKeys.delete(stateKey)
        this._pressTime.delete(stateKey)
        this._lastFire.delete(stateKey)
        this._angleHeld.set(cfg.id, region.id)
      }

      this._handleHeld(stateKey, region.key_combo)
    }
  }

  private _handleHeld(key: string, combo: string): void {
    const now = Date.now()

    if (!this._heldKeys.has(key)) {
      // First press
      this._heldKeys.add(key)
      this._pressTime.set(key, now)
      this._lastFire.set(key, now)
      keyboardService.pressCombo(combo).catch(() => {})
      return
    }

    const pressedAt = this._pressTime.get(key) ?? now
    const lastFiredAt = this._lastFire.get(key) ?? now

    const elapsed = (now - pressedAt) / 1000
    const sinceLast = (now - lastFiredAt) / 1000

    if (elapsed >= this._initialDelay && sinceLast >= this._repeatInterval) {
      this._lastFire.set(key, now)
      keyboardService.pressCombo(combo).catch(() => {})
    }
  }
}

function _findAngleRegion(cfg: AngleMappingConfig, angle: number): AngleMappingConfig['regions'][0] | null {
  const { nodes, regions } = cfg
  const n = nodes.length
  if (n === 0 || regions.length === 0) return null
  if (n === 1) return regions[0] ?? null

  for (let i = 0; i < n; i++) {
    const start = nodes[i].angle
    const end = nodes[(i + 1) % n].angle
    const region = regions[i]
    if (!region) continue

    const inRegion = start < end
      ? angle >= start && angle < end
      : angle >= start || angle < end // wrap-around (e.g. 315° → 45°)

    if (inRegion) return region
  }
  return null
}
