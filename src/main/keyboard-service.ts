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

// Safe dynamic import for the Interception driver wrapper
let InterceptionClass: any = null
try {
  InterceptionClass = require('node-interception').Interception
} catch (e) {
  console.warn('node-interception could not be loaded (driver might not be installed):', e)
}

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
  private _captureKeyUpListener: ((e: { keycode: number }) => void) | null = null
  private _pressedKeys = new Set<string>()
  private _heldKeys = new Set<string>()
  private _activeModifiers = new Set<string>()
  private _suspendedModifiers = new Set<string>()
  private _isolatedKeysHeld = new Set<string>()
  private _combinableModifiers = new Set<string>()

  // Interception driver support
  private _useInterception = false
  private _interception: any = null
  private _interceptionDevice: any = null

  setUseInterception(value: boolean): void {
    this._useInterception = value
    if (value) {
      this._initInterception()
    } else {
      this._destroyInterception()
    }
  }

  private _initInterception(): void {
    if (this._interception) return
    if (!InterceptionClass) {
      console.warn("Interception driver is not installed or node-interception failed to load.")
      return
    }
    try {
      this._interception = new InterceptionClass()
      const keyboards = this._interception.getKeyboards()
      if (keyboards.length > 0) {
        // Use the first keyboard device as the standard simulation channel
        this._interceptionDevice = keyboards[0]
        console.log("Interception initialized successfully. Device:", this._interceptionDevice.toString())
      } else {
        console.warn("Interception context created, but no keyboard devices were detected.")
        this._destroyInterception()
      }
    } catch (e) {
      console.error("Failed to initialize Interception context:", e)
      this._interception = null
      this._interceptionDevice = null
    }
  }

  private _destroyInterception(): void {
    if (this._interception) {
      try {
        this._interception.destroy()
      } catch (e) {
        // ignore
      }
      this._interception = null
      this._interceptionDevice = null
    }
  }

  private _resolveScanCode(name: string): { code: number; isExtended: boolean } | null {
    const scanCodes: Record<string, { code: number; isExtended: boolean }> = {
      // Modifiers
      ctrl: { code: 0x1D, isExtended: false },
      control: { code: 0x1D, isExtended: false },
      alt: { code: 0x38, isExtended: false },
      shift: { code: 0x2A, isExtended: false },
      meta: { code: 0x5B, isExtended: true },
      win: { code: 0x5B, isExtended: true },

      // Special keys
      enter: { code: 0x1C, isExtended: false },
      return: { code: 0x1C, isExtended: false },
      space: { code: 0x39, isExtended: false },
      backspace: { code: 0x0E, isExtended: false },
      tab: { code: 0x0F, isExtended: false },
      escape: { code: 0x01, isExtended: false },
      esc: { code: 0x01, isExtended: false },
      delete: { code: 0x53, isExtended: true },
      del: { code: 0x53, isExtended: true },
      insert: { code: 0x52, isExtended: true },
      home: { code: 0x47, isExtended: true },
      end: { code: 0x4F, isExtended: true },
      pageup: { code: 0x49, isExtended: true },
      pagedown: { code: 0x51, isExtended: true },
      
      // Arrows
      left: { code: 0x4B, isExtended: true },
      right: { code: 0x4D, isExtended: true },
      up: { code: 0x48, isExtended: true },
      down: { code: 0x50, isExtended: true },

      // Functions
      f1: { code: 0x3B, isExtended: false },
      f2: { code: 0x3C, isExtended: false },
      f3: { code: 0x3D, isExtended: false },
      f4: { code: 0x3E, isExtended: false },
      f5: { code: 0x3F, isExtended: false },
      f6: { code: 0x40, isExtended: false },
      f7: { code: 0x41, isExtended: false },
      f8: { code: 0x42, isExtended: false },
      f9: { code: 0x43, isExtended: false },
      f10: { code: 0x44, isExtended: false },
      f11: { code: 0x57, isExtended: false },
      f12: { code: 0x58, isExtended: false },

      // Main row digits
      numrow0: { code: 0x0B, isExtended: false },
      numrow1: { code: 0x02, isExtended: false },
      numrow2: { code: 0x03, isExtended: false },
      numrow3: { code: 0x04, isExtended: false },
      numrow4: { code: 0x05, isExtended: false },
      numrow5: { code: 0x06, isExtended: false },
      numrow6: { code: 0x07, isExtended: false },
      numrow7: { code: 0x08, isExtended: false },
      numrow8: { code: 0x09, isExtended: false },
      numrow9: { code: 0x0A, isExtended: false },
      '0': { code: 0x0B, isExtended: false },
      '1': { code: 0x02, isExtended: false },
      '2': { code: 0x03, isExtended: false },
      '3': { code: 0x04, isExtended: false },
      '4': { code: 0x05, isExtended: false },
      '5': { code: 0x06, isExtended: false },
      '6': { code: 0x07, isExtended: false },
      '7': { code: 0x08, isExtended: false },
      '8': { code: 0x09, isExtended: false },
      '9': { code: 0x0A, isExtended: false },

      // Numpad digits
      numpad0: { code: 0x52, isExtended: false },
      numpad1: { code: 0x4F, isExtended: false },
      numpad2: { code: 0x50, isExtended: false },
      numpad3: { code: 0x51, isExtended: false },
      numpad4: { code: 0x4B, isExtended: false },
      numpad5: { code: 0x4C, isExtended: false },
      numpad6: { code: 0x4D, isExtended: false },
      numpad7: { code: 0x47, isExtended: false },
      numpad8: { code: 0x48, isExtended: false },
      numpad9: { code: 0x49, isExtended: false },
    }

    if (scanCodes[name] !== undefined) return scanCodes[name]

    if (name.length === 1 && name >= 'a' && name <= 'z') {
      const letterScanCodes: Record<string, number> = {
        a: 0x1E, b: 0x30, c: 0x2E, d: 0x20, e: 0x12, f: 0x21, g: 0x22, h: 0x23,
        i: 0x17, j: 0x24, k: 0x25, l: 0x26, m: 0x32, n: 0x31, o: 0x18, p: 0x19,
        q: 0x10, r: 0x13, s: 0x1F, t: 0x14, u: 0x16, v: 0x2F, w: 0x11, x: 0x2D,
        y: 0x15, z: 0x2C
      }
      const code = letterScanCodes[name]
      if (code !== undefined) {
        return { code, isExtended: false }
      }
    }

    return null
  }

  /**
   * Press a key combo string like "ctrl+shift+a" or "F5".
   * Fires key down then key up via nut-js or node-interception.
   */
  async pressCombo(combo: string, isolate = true, allowCombo = false): Promise<void> {
    if (isolate) {
      await this.sendKeyDown(combo, true, allowCombo)
      await new Promise(resolve => setTimeout(resolve, 10))
      await this.sendKeyUp(combo, true)
    } else {
      await this._pressComboRaw(combo)
    }
  }

  private async _pressComboRaw(combo: string): Promise<void> {
    const parts = combo
      .toLowerCase()
      .split('+')
      .map((p) => p.trim())

    if (this._useInterception && this._interceptionDevice) {
      const resolvedKeys = parts.map(part => this._resolveScanCode(part)).filter(k => k !== null) as { code: number; isExtended: boolean }[]
      if (resolvedKeys.length === 0) return

      try {
        // Press all keys down in order
        for (const r of resolvedKeys) {
          const state = r.isExtended ? 2 : 0 // 2 is KeyState.E0 (Extended Down), 0 is KeyState.DOWN
          this._interceptionDevice.send({
            type: 'keyboard',
            code: r.code,
            state: state,
            information: 0
          })
        }

        // Release all keys in reverse order
        for (let i = resolvedKeys.length - 1; i >= 0; i--) {
          const r = resolvedKeys[i]
          const state = r.isExtended ? 3 : 1 // 3 is KeyState.E0 | KeyState.UP (Extended Up), 1 is KeyState.UP
          this._interceptionDevice.send({
            type: 'keyboard',
            code: r.code,
            state: state,
            information: 0
          })
        }
      } catch (e) {
        console.error("Interception failed to send keys:", e)
      }
      return
    }

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

  /**
   * Simulates holding a key combo string down.
   */
  async sendKeyDown(combo: string, isolate = true, allowCombo = false): Promise<void> {
    const parts = combo
      .toLowerCase()
      .split('+')
      .map((p) => p.trim())

    if (isolate) {
      this._isolatedKeysHeld.add(combo)

      const currentModifiers = new Set<string>()
      const MODIFIER_NAMES = ['ctrl', 'control', 'alt', 'shift', 'meta', 'win']
      for (const part of parts) {
        if (MODIFIER_NAMES.includes(part)) {
          currentModifiers.add(part)
        }
      }

      const toSuspend = Array.from(this._activeModifiers)
        .filter((m) => !currentModifiers.has(m))
        .filter((m) => !this._combinableModifiers.has(m))

      if (toSuspend.length > 0) {
        for (const mod of toSuspend) {
          if (!this._suspendedModifiers.has(mod)) {
            await this._releaseSingleKey(mod)
            this._suspendedModifiers.add(mod)
          }
        }
      }
    }

    await this._sendKeyDownRaw(combo, allowCombo)
  }

  private async _sendKeyDownRaw(combo: string, allowCombo = false): Promise<void> {
    const parts = combo
      .toLowerCase()
      .split('+')
      .map((p) => p.trim())

    const MODIFIER_NAMES = ['ctrl', 'control', 'alt', 'shift', 'meta', 'win']
    const keysToPress: string[] = []

    for (const part of parts) {
      if (MODIFIER_NAMES.includes(part)) {
        this._activeModifiers.add(part)
        if (allowCombo) {
          this._combinableModifiers.add(part)
        }
        // If an isolated key is active and this modifier is not in it, and it's not combinable, suspend instead of pressing
        if (this._isolatedKeysHeld.size > 0 && !this._isModifierInIsolatedKeys(part) && !this._combinableModifiers.has(part)) {
          this._suspendedModifiers.add(part)
          continue
        }
      }
      keysToPress.push(part)
    }

    if (keysToPress.length === 0) return

    if (this._useInterception && this._interceptionDevice) {
      const resolvedKeys = keysToPress.map(part => this._resolveScanCode(part)).filter(k => k !== null) as { code: number; isExtended: boolean }[]
      if (resolvedKeys.length === 0) return

      try {
        // Press all keys down in order
        for (const r of resolvedKeys) {
          const state = r.isExtended ? 2 : 0 // 2 is KeyState.E0 (Extended Down), 0 is KeyState.DOWN
          this._interceptionDevice.send({
            type: 'keyboard',
            code: r.code,
            state: state,
            information: 0
          })
        }
      } catch (e) {
        console.error("Interception failed to send keys down:", e)
      }
      return
    }

    const keys: import('@nut-tree-fork/nut-js').Key[] = []

    for (const part of keysToPress) {
      const key = this._resolveKey(part)
      if (key !== null) keys.push(key)
    }

    if (keys.length === 0) return

    try {
      await keyboard.pressKey(...keys)
    } catch {
      // ignore — target window may not accept input
    }
  }

  /**
   * Simulates releasing a key combo string.
   */
  async sendKeyUp(combo: string, isolate = true): Promise<void> {
    if (isolate) {
      this._isolatedKeysHeld.delete(combo)
    }

    await this._sendKeyUpRaw(combo)

    if (isolate && this._isolatedKeysHeld.size === 0) {
      // Restore suspended modifiers
      if (this._suspendedModifiers.size > 0) {
        for (const mod of this._suspendedModifiers) {
          if (this._activeModifiers.has(mod)) {
            await this._pressSingleKey(mod)
          }
        }
        this._suspendedModifiers.clear()
      }
    }
  }

  private async _sendKeyUpRaw(combo: string): Promise<void> {
    const parts = combo
      .toLowerCase()
      .split('+')
      .map((p) => p.trim())

    const MODIFIER_NAMES = ['ctrl', 'control', 'alt', 'shift', 'meta', 'win']
    const keysToRelease: string[] = []

    for (const part of parts) {
      if (MODIFIER_NAMES.includes(part)) {
        this._activeModifiers.delete(part)
        this._combinableModifiers.delete(part)
        if (this._suspendedModifiers.has(part)) {
          this._suspendedModifiers.delete(part)
          continue
        }
      }
      keysToRelease.push(part)
    }

    if (keysToRelease.length === 0) return

    if (this._useInterception && this._interceptionDevice) {
      const resolvedKeys = keysToRelease.map(part => this._resolveScanCode(part)).filter(k => k !== null) as { code: number; isExtended: boolean }[]
      if (resolvedKeys.length === 0) return

      try {
        // Release all keys in reverse order (releasing modifiers last)
        for (let i = resolvedKeys.length - 1; i >= 0; i--) {
          const r = resolvedKeys[i]
          const state = r.isExtended ? 3 : 1 // 3 is KeyState.E0 | KeyState.UP (Extended Up), 1 is KeyState.UP
          this._interceptionDevice.send({
            type: 'keyboard',
            code: r.code,
            state: state,
            information: 0
          })
        }
      } catch (e) {
        console.error("Interception failed to send keys up:", e)
      }
      return
    }

    const keys: import('@nut-tree-fork/nut-js').Key[] = []

    for (const part of keysToRelease) {
      const key = this._resolveKey(part)
      if (key !== null) keys.push(key)
    }

    if (keys.length === 0) return

    try {
      await keyboard.releaseKey(...keys)
    } catch {
      // ignore — target window may not accept input
    }
  }

  private _isModifierInIsolatedKeys(mod: string): boolean {
    for (const combo of this._isolatedKeysHeld) {
      const parts = combo.toLowerCase().split('+').map(p => p.trim())
      if (parts.includes(mod)) return true
    }
    return false
  }

  private async _pressSingleKey(name: string): Promise<void> {
    if (this._useInterception && this._interceptionDevice) {
      const r = this._resolveScanCode(name)
      if (!r) return
      try {
        const state = r.isExtended ? 2 : 0
        this._interceptionDevice.send({
          type: 'keyboard',
          code: r.code,
          state: state,
          information: 0
        })
      } catch (e) {
        console.error("Interception failed to press single key:", e)
      }
      return
    }

    const key = this._resolveKey(name)
    if (!key) return
    try {
      await keyboard.pressKey(key)
    } catch {
      // ignore
    }
  }

  private async _releaseSingleKey(name: string): Promise<void> {
    if (this._useInterception && this._interceptionDevice) {
      const r = this._resolveScanCode(name)
      if (!r) return
      try {
        const state = r.isExtended ? 3 : 1
        this._interceptionDevice.send({
          type: 'keyboard',
          code: r.code,
          state: state,
          information: 0
        })
      } catch (e) {
        console.error("Interception failed to release single key:", e)
      }
      return
    }

    const key = this._resolveKey(name)
    if (!key) return
    try {
      await keyboard.releaseKey(key)
    } catch {
      // ignore
    }
  }

  startCapture(callback: KeyCaptureCallback): void {
    if (this._capturing) this.stopCapture()
    this._capturing = true
    this._captureCallback = callback
    this._pressedKeys.clear()
    this._heldKeys.clear()

    const getNormalizedKeyName = (keycode: number): string | null => {
      const name = uiohookKeyName(keycode)
      if (!name) return null

      const modAliases: Record<string, string> = {
        LeftCtrl: 'ctrl', RightCtrl: 'ctrl',
        LeftAlt: 'alt', RightAlt: 'alt',
        LeftShift: 'shift', RightShift: 'shift',
        LeftMeta: 'meta', RightMeta: 'meta',
        Ctrl: 'ctrl', Alt: 'alt', Shift: 'shift', Meta: 'meta',
      }

      if (modAliases[name] !== undefined) {
        return modAliases[name]
      }

      const KEY_DISPLAY: Record<string, string> = {
        Numrow0: '0', Numrow1: '1', Numrow2: '2', Numrow3: '3', Numrow4: '4',
        Numrow5: '5', Numrow6: '6', Numrow7: '7', Numrow8: '8', Numrow9: '9',
        Space: 'space', Return: 'enter', Backspace: 'backspace', Tab: 'tab',
        Escape: 'esc', Delete: 'delete', Insert: 'insert',
        Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      }

      return KEY_DISPLAY[name] ?? name.toLowerCase()
    }

    this._captureListener = (e: { keycode: number }) => {
      const name = getNormalizedKeyName(e.keycode)
      if (!name) return

      this._pressedKeys.add(name)
      this._heldKeys.add(name)
    }

    this._captureKeyUpListener = (e: { keycode: number }) => {
      const name = getNormalizedKeyName(e.keycode)
      if (!name) return

      this._heldKeys.delete(name)

      // Only finish when all pressed keys are fully released
      if (this._heldKeys.size === 0 && this._pressedKeys.size > 0) {
        const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta']
        const sortedParts = Array.from(this._pressedKeys).sort((a, b) => {
          const idxA = MODIFIER_ORDER.indexOf(a)
          const idxB = MODIFIER_ORDER.indexOf(b)
          const isModA = idxA !== -1
          const isModB = idxB !== -1

          if (isModA && isModB) return idxA - idxB
          if (isModA) return -1
          if (isModB) return 1
          return a.localeCompare(b)
        })

        const combo = sortedParts.join('+')
        const cb = this._captureCallback
        this.stopCapture()
        cb?.(combo)
      }
    }

    uIOhook.on('keydown', this._captureListener)
    uIOhook.on('keyup', this._captureKeyUpListener)
    uIOhook.start()
  }

  stopCapture(): void {
    if (!this._capturing) return
    this._capturing = false
    if (this._captureListener) {
      uIOhook.off('keydown', this._captureListener)
      this._captureListener = null
    }
    if (this._captureKeyUpListener) {
      uIOhook.off('keyup', this._captureKeyUpListener)
      this._captureKeyUpListener = null
    }
    this._captureCallback = null
    this._heldModifiers.clear()
    this._pressedKeys.clear()
    this._heldKeys.clear()
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
      // uiohook names for main-row digit keys (e.g. captured as "numrow1")
      numrow0: Key.Num0, numrow1: Key.Num1, numrow2: Key.Num2,
      numrow3: Key.Num3, numrow4: Key.Num4, numrow5: Key.Num5,
      numrow6: Key.Num6, numrow7: Key.Num7, numrow8: Key.Num8,
      numrow9: Key.Num9,
      // uiohook names for numpad digit keys
      numpad0: Key.NumPad0, numpad1: Key.NumPad1, numpad2: Key.NumPad2,
      numpad3: Key.NumPad3, numpad4: Key.NumPad4, numpad5: Key.NumPad5,
      numpad6: Key.NumPad6, numpad7: Key.NumPad7, numpad8: Key.NumPad8,
      numpad9: Key.NumPad9,
      // bare digit strings (from manual or normalized entry)
      '0': Key.Num0, '1': Key.Num1, '2': Key.Num2, '3': Key.Num3,
      '4': Key.Num4, '5': Key.Num5, '6': Key.Num6, '7': Key.Num7,
      '8': Key.Num8, '9': Key.Num9,
    }

    if (map[name] !== undefined) return map[name]

    // Single letter — nut-js Key enum uses uppercase names (A, B, C, ...)
    if (name.length === 1) {
      const upper = name.toUpperCase()
      return (Key as Record<string, import('@nut-tree-fork/nut-js').Key>)[upper] ?? null
    }

    return null
  }
}

export const keyboardService = new KeyboardService()
