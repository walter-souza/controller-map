/**
 * ControllerService — wraps @kmamal/sdl joystick API.
 *
 * IMPORTANT: SDL_JOYSTICK_RAWINPUT=1 must be set in the environment BEFORE
 * @kmamal/sdl is first required. This bypasses XInput exclusive locks from apps
 * like 8BitDo Software or Steam, allowing us to read controller events.
 * The env var is set in src/main/index.ts before any imports.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sdl = require('@kmamal/sdl') as typeof import('@kmamal/sdl')

import type { DeviceInfo, CaptureResult } from '../shared/models'

const AXIS_THRESHOLD = 0.5
const AXIS_DEADZONE = 0.15

export type ButtonCaptureCallback = (result: CaptureResult) => void
export type ChordCaptureCallback = (results: CaptureResult[]) => void

type SdlDevice = (typeof sdl.joystick.devices)[number]
type SdlJoystickInstance = ReturnType<typeof sdl.joystick.openDevice>

function axisArrow(axisId: number, direction: number): string {
  if (axisId === 0) return direction > 0 ? '→' : '←'
  if (axisId === 1) return direction > 0 ? '↓' : '↑'
  return `E${axisId}${direction > 0 ? '+' : '-'}`
}

export class ControllerService {
  private _captureCallback: ButtonCaptureCallback | null = null
  private _captureInstance: SdlJoystickInstance | null = null

  private _chordCaptureCallback: ChordCaptureCallback | null = null
  private _chordCaptureInstance: SdlJoystickInstance | null = null
  private _chordHeld = new Set<number>()
  private _chordAccumulated: CaptureResult[] = []
  private _chordButtonDown: ((e: { button: number }) => void) | null = null
  private _chordButtonUp: ((e: { button: number }) => void) | null = null
  private _chordAxisMotion: ((e: { axis: number; value: number }) => void) | null = null

  private _monitorTrackerInstance: SdlJoystickInstance | null = null
  private _monitorListeners: {
    down: (e: { button: number }) => void
    up: (e: { button: number }) => void
    axis: (e: { axis: number; value: number }) => void
  } | null = null

  /**
   * Tracker instances kept open so SDL can resolve SDL_JoystickFromInstanceID()
   * for connected devices. @kmamal/sdl starts polling automatically on load,
   * and any queued joystick events for unopened devices cause a fatal SDL error.
   */
  private _trackers = new Map<number, SdlJoystickInstance>()

  getDevices(): DeviceInfo[] {
    try {
      const devices = sdl.joystick.devices as SdlDevice[]
      const currentIds = new Set(devices.map((d) => d.id))

      // Close trackers for disconnected devices
      for (const [id, inst] of this._trackers) {
        if (!currentIds.has(id)) {
          try { if (!inst.closed) inst.close() } catch { /* ignore */ }
          this._trackers.delete(id)
        }
      }

      // Open trackers for newly connected devices
      // Open trackers for newly connected devices
      for (const d of devices) {
        if (!this._trackers.has(d.id)) {
          try {
            const inst = sdl.joystick.openDevice(d)
            this._setupHatSimulation(inst)
            this._trackers.set(d.id, inst)
          } catch { /* ignore */ }
        }
      }

      return devices.map((d) => ({
        id: d.id,
        name: d.name ?? `Controller ${d.id}`,
      }))
    } catch {
      return []
    }
  }

  startCapture(deviceId: number, callback: ButtonCaptureCallback): void {
    this._captureCallback = callback
    try {
      const device = sdl.joystick.devices.find((d: SdlDevice) => d.id === deviceId)
      if (!device) return
      const instance = sdl.joystick.openDevice(device)
      this._setupHatSimulation(instance)
      this._captureInstance = instance

      instance.on('buttonDown', this._onButtonDown)
      instance.on('axisMotion', this._onAxisMotion)
    } catch {
      this._captureCallback = null
    }
  }

  stopCapture(): void {
    if (this._captureInstance) {
      this._captureInstance.off('buttonDown', this._onButtonDown)
      this._captureInstance.off('axisMotion', this._onAxisMotion)
      if (!this._captureInstance.closed) {
        this._captureInstance.close()
      }
      this._captureInstance = null
    }
    this._captureCallback = null
  }

  startChordCapture(deviceId: number, callback: ChordCaptureCallback): void {
    this.stopChordCapture()
    this._chordCaptureCallback = callback
    this._chordHeld.clear()
    this._chordAccumulated = []

    try {
      const device = sdl.joystick.devices.find((d: SdlDevice) => d.id === deviceId)
      if (!device) return
      const instance = sdl.joystick.openDevice(device)
      this._setupHatSimulation(instance)
      this._chordCaptureInstance = instance

      // Track active analog axes (e.g. L2/R2) separately from digital buttons.
      // An axis "joins" the chord when it crosses AXIS_THRESHOLD, and "leaves"
      // when it falls back below AXIS_DEADZONE.
      const activeAxes = new Set<number>()

      const tryCommit = () => {
        if (this._chordHeld.size === 0 && activeAxes.size === 0 && this._chordAccumulated.length > 0) {
          const results = [...this._chordAccumulated]
          const cb = this._chordCaptureCallback
          this.stopChordCapture()
          cb?.(results)
        }
      }

      this._chordButtonDown = (event: { button: number }) => {
        if (!this._chordHeld.has(event.button)) {
          this._chordHeld.add(event.button)
          this._chordAccumulated.push({
            type: 'button',
            button_id: event.button,
            button_name: `Botão ${event.button}`,
          })
        }
      }

      this._chordButtonUp = (_event: { button: number }) => {
        this._chordHeld.delete(_event.button)
        tryCommit()
      }

      this._chordAxisMotion = (event: { axis: number; value: number }) => {
        const alreadyActive = activeAxes.has(event.axis)
        if (Math.abs(event.value) >= AXIS_THRESHOLD) {
          if (!alreadyActive) {
            activeAxes.add(event.axis)
            const direction = event.value > 0 ? 1 : -1
            // Only add if not already accumulated for this axis+direction
            const alreadyIn = this._chordAccumulated.some(
              (r) => r.type === 'axis' && r.button_id === event.axis && (r as { axis_direction?: number }).axis_direction === direction,
            )
            if (!alreadyIn) {
              this._chordAccumulated.push({
                type: 'axis',
                button_id: event.axis,
                button_name: axisArrow(event.axis, direction),
                axis_direction: direction,
              })
            }
          }
        } else if (Math.abs(event.value) < AXIS_DEADZONE && alreadyActive) {
          activeAxes.delete(event.axis)
          tryCommit()
        }
      }

      instance.on('buttonDown', this._chordButtonDown)
      instance.on('buttonUp', this._chordButtonUp)
      instance.on('axisMotion', this._chordAxisMotion)
    } catch {
      this._chordCaptureCallback = null
    }
  }

  stopChordCapture(): void {
    if (this._chordCaptureInstance) {
      if (this._chordButtonDown) this._chordCaptureInstance.off('buttonDown', this._chordButtonDown)
      if (this._chordButtonUp) this._chordCaptureInstance.off('buttonUp', this._chordButtonUp)
      if (this._chordAxisMotion) this._chordCaptureInstance.off('axisMotion', this._chordAxisMotion)
      if (!this._chordCaptureInstance.closed) this._chordCaptureInstance.close()
      this._chordCaptureInstance = null
    }
    this._chordCaptureCallback = null
    this._chordButtonDown = null
    this._chordButtonUp = null
    this._chordAxisMotion = null
    this._chordHeld.clear()
    this._chordAccumulated = []
  }

  startMonitor(
    deviceId: number,
    onButtonDown: (button: number) => void,
    onButtonUp: (button: number) => void,
    onAxisMotion: (axis: number, value: number) => void,
  ): void {
    this.stopMonitor()
    const tracker = this._trackers.get(deviceId)
    if (!tracker || tracker.closed) return

    const down = (e: { button: number }) => onButtonDown(e.button)
    const up = (e: { button: number }) => onButtonUp(e.button)
    const axis = (e: { axis: number; value: number }) => onAxisMotion(e.axis, e.value)

    tracker.on('buttonDown', down)
    tracker.on('buttonUp', up)
    tracker.on('axisMotion', axis)

    this._monitorTrackerInstance = tracker
    this._monitorListeners = { down, up, axis }
  }

  stopMonitor(): void {
    if (this._monitorTrackerInstance && this._monitorListeners) {
      try {
        this._monitorTrackerInstance.off('buttonDown', this._monitorListeners.down)
        this._monitorTrackerInstance.off('buttonUp', this._monitorListeners.up)
        this._monitorTrackerInstance.off('axisMotion', this._monitorListeners.axis)
      } catch { /* ignore */ }
    }
    this._monitorTrackerInstance = null
    this._monitorListeners = null
  }

  private _onButtonDown = (event: { button: number }) => {
    if (!this._captureCallback) return
    const result: CaptureResult = {
      type: 'button',
      button_id: event.button,
      button_name: `Botão ${event.button}`,
    }
    const cb = this._captureCallback
    this.stopCapture()
    cb(result)
  }

  private _onAxisMotion = (event: { axis: number; value: number }) => {
    if (!this._captureCallback) return
    if (Math.abs(event.value) < AXIS_THRESHOLD) return

    const direction = event.value > 0 ? 1 : -1
    const result: CaptureResult = {
      type: 'axis',
      button_id: event.axis,
      button_name: axisArrow(event.axis, direction),
      axis_direction: direction,
    }
    const cb = this._captureCallback
    this.stopCapture()
    cb(result)
  }

  /** No-op: @kmamal/sdl emits events automatically (no manual poll needed). */
  pollEvents(): void {}

  getAxisValue(joystick: SdlJoystickInstance, axisId: number): number {
    try {
      return joystick.axes[axisId] ?? 0
    } catch {
      return 0
    }
  }

  openJoystick(deviceId: number): SdlJoystickInstance | null {
    try {
      const device = sdl.joystick.devices.find((d: SdlDevice) => d.id === deviceId)
      if (!device) return null
      const instance = sdl.joystick.openDevice(device)
      this._setupHatSimulation(instance)
      return instance
    } catch {
      return null
    }
  }

  closeJoystick(joystick: SdlJoystickInstance): void {
    try {
      if (!joystick.closed) joystick.close()
    } catch {
      // ignore
    }
  }

  getButtonState(joystick: SdlJoystickInstance, buttonId: number): boolean {
    try {
      return joystick.buttons[buttonId] ?? false
    } catch {
      return false
    }
  }

  isAxisActive(value: number): boolean {
    return Math.abs(value) > AXIS_THRESHOLD
  }

  isAxisResting(value: number): boolean {
    return Math.abs(value) < AXIS_DEADZONE
  }

  private _setupHatSimulation(instance: SdlJoystickInstance): void {
    if (!instance) return
    try {
      const dpadState = {
        up: false,
        down: false,
        left: false,
        right: false,
      }

      // Ensure buttons array has at least 15 slots so buttons 11-14 are included in length
      // and won't throw out of bounds.
      if (!instance.buttons) {
        // @ts-ignore
        instance.buttons = []
      }
      while (instance.buttons.length < 15) {
        instance.buttons.push(false)
      }

      // Also pad internal _buttons array if it exists
      // @ts-ignore
      if (instance._buttons) {
        // @ts-ignore
        while (instance._buttons.length < 15) {
          // @ts-ignore
          instance._buttons.push(false)
        }
      }

      instance.on('hatMotion', (event: { hat: number; value: string }) => {
        if (event.hat !== 0) return
        const val = event.value || ''
        const nextUp = val.includes('up')
        const nextDown = val.includes('down')
        const nextLeft = val.includes('left')
        const nextRight = val.includes('right')

        const handleButtonTransition = (buttonId: number, current: boolean, next: boolean) => {
          if (current !== next) {
            try {
              instance.buttons[buttonId] = next
              // @ts-ignore
              if (instance._buttons) {
                // @ts-ignore
                instance._buttons[buttonId] = next
              }
            } catch { /* ignore */ }

            if (next) {
              instance.emit('buttonDown', { button: buttonId })
            } else {
              instance.emit('buttonUp', { button: buttonId })
            }
          }
        }

        handleButtonTransition(11, dpadState.up, nextUp)
        dpadState.up = nextUp

        handleButtonTransition(12, dpadState.down, nextDown)
        dpadState.down = nextDown

        handleButtonTransition(13, dpadState.left, nextLeft)
        dpadState.left = nextLeft

        handleButtonTransition(14, dpadState.right, nextRight)
        dpadState.right = nextRight
      })
    } catch { /* ignore */ }
  }
}

export const controllerService = new ControllerService()
