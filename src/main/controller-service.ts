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

  getDevices(): DeviceInfo[] {
    try {
      return sdl.joystick.devices.map((d: SdlDevice) => ({
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
      return sdl.joystick.openDevice(device)
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
}

export const controllerService = new ControllerService()
