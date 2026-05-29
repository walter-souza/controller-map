/**
 * Mapper — polls joystick state and fires key combos.
 *
 * Ported from src/mapper.py. Runs on a setInterval(16) tick in the main process.
 * No separate thread needed — Node.js event loop handles timing.
 */

import type { Mapping } from '../shared/models'
import { controllerService } from './controller-service'
import { keyboardService } from './keyboard-service'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sdl = require('@kmamal/sdl') as typeof import('@kmamal/sdl')
type JoystickInstance = ReturnType<typeof sdl.joystick.openDevice>

const AXIS_THRESHOLD = 0.5
const AXIS_DEADZONE = 0.15

interface AxisMapping {
  mappings: Mapping[]
}

interface ButtonMapping {
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

  // Hold-repeat tracking
  private _heldKeys = new Set<string>()        // composite key string
  private _pressTime = new Map<string, number>() // ms since epoch
  private _lastFire = new Map<string, number>()  // ms since epoch
  // Axis state: last active direction per axis
  private _axisState = new Map<number, number>()

  constructor(
    deviceId: number,
    mappings: Mapping[],
    onDisconnect?: () => void,
    initialDelay = 0.4,
    repeatInterval = 0.05,
  ) {
    this._deviceId = deviceId
    this._onDisconnect = onDisconnect
    this._initialDelay = initialDelay
    this._repeatInterval = repeatInterval
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
    this._tickInterval = setInterval(() => this._tick(), 16)
  }

  stop(): void {
    if (this._tickInterval !== null) {
      clearInterval(this._tickInterval)
      this._tickInterval = null
    }
    if (this._joystick) {
      controllerService.closeJoystick(this._joystick)
      this._joystick = null
    }
    this._isActive = false
    this._heldKeys.clear()
    this._pressTime.clear()
    this._lastFire.clear()
    this._axisState.clear()
  }

  private _buildMappings(mappings: Mapping[]): void {
    this._buttonMappings.clear()
    this._axisMappings.clear()
    this._diagonalMappings = []

    for (const m of mappings) {
      if (m.source_type === 'button') {
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

    // Check button states via SDL events (held tracking is done externally via events)
    // For simplicity: re-read button states from joystick object each tick
    this._processButtons()
    this._processAxes()
    this._processDiagonals()
  }

  private _processButtons(): void {
    if (!this._joystick) return
    const buttons = this._joystick.buttons

    for (let btn = 0; btn < buttons.length; btn++) {
      const entry = this._buttonMappings.get(btn)
      if (!entry) continue
      const pressed = buttons[btn] ?? false
      const key = `btn:${btn}`
      if (pressed) {
        this._handleHeld(key, entry.mapping.key_combo)
      } else {
        this._heldKeys.delete(key)
        this._pressTime.delete(key)
        this._lastFire.delete(key)
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
