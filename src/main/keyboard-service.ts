/**
 * KeyboardService — keyboard simulation (SendInput) and key capture.
 *
 * Uses:
 *   @nut-tree-fork/nut-js  — keyboard simulation via Win32 SendInput
 *   uiohook-napi           — global key capture for mapping
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { keyboard, Key } = require('@nut-tree-fork/nut-js') as typeof import('@nut-tree-fork/nut-js')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { uIOhook, UiohookKey } = require('uiohook-napi') as typeof import('uiohook-napi')

// Eliminate nut-js built-in delay between key press and release (default is 500ms!)
keyboard.config.autoDelayMs = 0

export type KeyCaptureCallback = (combo: string) => void

// Map uiohook keycode to readable name
function uiohookKeyName(keycode: number): string | null {
  const entries = Object.entries(UiohookKey) as [string, number][]
  const entry = entries.find(([, v]) => v === keycode)
  return entry ? entry[0] : null
}

export class KeyboardService {
  private _capturing = false
  private _captureCallback: KeyCaptureCallback | null = null
  private _heldModifiers = new Set<string>()
  private _captureListener: ((e: { keycode: number }) => void) | null = null

  /**
   * Press a key combo string like "ctrl+shift+a" or "F5".
   * Fires key down then key up via nut-js.
   */
  async pressCombo(combo: string): Promise<void> {
    const parts = combo
      .toLowerCase()
      .split('+')
      .map((p) => p.trim())
    const keys: import('@nut-tree-fork/nut-js').Key[] = []

    for (const part of parts) {
      const key = this._resolveKey(part)
      if (key !== null) keys.push(key)
    }

    if (keys.length === 0) return

    try {
      await keyboard.pressKey(...keys)
      await keyboard.releaseKey(...keys)
    } catch {
      // ignore — target window may not accept input
    }
  }

  startCapture(callback: KeyCaptureCallback): void {
    if (this._capturing) this.stopCapture()
    this._capturing = true
    this._captureCallback = callback
    this._heldModifiers.clear()

    this._captureListener = (e: { keycode: number }) => {
      const name = uiohookKeyName(e.keycode)
      if (!name) return

      const MODIFIERS = ['Ctrl', 'LeftCtrl', 'RightCtrl', 'Alt', 'LeftAlt', 'RightAlt', 'Shift', 'LeftShift', 'RightShift', 'Meta', 'LeftMeta', 'RightMeta']
      const modAliases: Record<string, string> = {
        LeftCtrl: 'ctrl', RightCtrl: 'ctrl',
        LeftAlt: 'alt', RightAlt: 'alt',
        LeftShift: 'shift', RightShift: 'shift',
        LeftMeta: 'meta', RightMeta: 'meta',
        Ctrl: 'ctrl', Alt: 'alt', Shift: 'shift', Meta: 'meta',
      }

      if (MODIFIERS.includes(name)) {
        this._heldModifiers.add(modAliases[name])
        return
      }

      // Non-modifier key pressed — form combo
      const parts = [...this._heldModifiers, name.toLowerCase()]
      const combo = parts.join('+')
      const cb = this._captureCallback
      this.stopCapture()
      cb?.(combo)
    }

    uIOhook.on('keydown', this._captureListener)
    uIOhook.start()
  }

  stopCapture(): void {
    if (!this._capturing) return
    this._capturing = false
    if (this._captureListener) {
      uIOhook.off('keydown', this._captureListener)
      this._captureListener = null
    }
    this._captureCallback = null
    this._heldModifiers.clear()
    try { uIOhook.stop() } catch { /* ignore */ }
  }

  private _resolveKey(name: string): import('@nut-tree-fork/nut-js').Key | null {
    const map: Record<string, import('@nut-tree-fork/nut-js').Key> = {
      ctrl: Key.LeftControl,
      control: Key.LeftControl,
      alt: Key.LeftAlt,
      shift: Key.LeftShift,
      meta: Key.LeftSuper,
      win: Key.LeftSuper,
      enter: Key.Return,
      return: Key.Return,
      space: Key.Space,
      backspace: Key.Backspace,
      tab: Key.Tab,
      escape: Key.Escape,
      esc: Key.Escape,
      delete: Key.Delete,
      del: Key.Delete,
      insert: Key.Insert,
      home: Key.Home,
      end: Key.End,
      pageup: Key.PageUp,
      pagedown: Key.PageDown,
      left: Key.Left,
      right: Key.Right,
      up: Key.Up,
      down: Key.Down,
      f1: Key.F1, f2: Key.F2, f3: Key.F3, f4: Key.F4,
      f5: Key.F5, f6: Key.F6, f7: Key.F7, f8: Key.F8,
      f9: Key.F9, f10: Key.F10, f11: Key.F11, f12: Key.F12,
    }

    if (map[name]) return map[name]

    // Single character
    if (name.length === 1) {
      const upper = name.toUpperCase()
      return (Key as Record<string, import('@nut-tree-fork/nut-js').Key>)[upper] ?? null
    }

    return null
  }
}

export const keyboardService = new KeyboardService()
