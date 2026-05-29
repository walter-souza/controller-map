"use strict";
const electron = require("electron");
const path = require("path");
const Store = require("electron-store");
const sdl = require("@kmamal/sdl");
const AXIS_THRESHOLD$1 = 0.5;
const AXIS_DEADZONE$1 = 0.15;
function axisArrow(axisId, direction) {
  if (axisId === 0) return direction > 0 ? "→" : "←";
  if (axisId === 1) return direction > 0 ? "↓" : "↑";
  return `E${axisId}${direction > 0 ? "+" : "-"}`;
}
class ControllerService {
  constructor() {
    this._captureCallback = null;
    this._captureInstance = null;
    this._onButtonDown = (event) => {
      if (!this._captureCallback) return;
      const result = {
        type: "button",
        button_id: event.button,
        button_name: `Botão ${event.button}`
      };
      const cb = this._captureCallback;
      this.stopCapture();
      cb(result);
    };
    this._onAxisMotion = (event) => {
      if (!this._captureCallback) return;
      if (Math.abs(event.value) < AXIS_THRESHOLD$1) return;
      const direction = event.value > 0 ? 1 : -1;
      const result = {
        type: "axis",
        button_id: event.axis,
        button_name: axisArrow(event.axis, direction),
        axis_direction: direction
      };
      const cb = this._captureCallback;
      this.stopCapture();
      cb(result);
    };
  }
  getDevices() {
    try {
      return sdl.joystick.devices.map((d) => ({
        id: d.id,
        name: d.name ?? `Controller ${d.id}`
      }));
    } catch {
      return [];
    }
  }
  startCapture(deviceId, callback) {
    this._captureCallback = callback;
    try {
      const device = sdl.joystick.devices.find((d) => d.id === deviceId);
      if (!device) return;
      const instance = sdl.joystick.openDevice(device);
      this._captureInstance = instance;
      instance.on("buttonDown", this._onButtonDown);
      instance.on("axisMotion", this._onAxisMotion);
    } catch {
      this._captureCallback = null;
    }
  }
  stopCapture() {
    if (this._captureInstance) {
      this._captureInstance.off("buttonDown", this._onButtonDown);
      this._captureInstance.off("axisMotion", this._onAxisMotion);
      if (!this._captureInstance.closed) {
        this._captureInstance.close();
      }
      this._captureInstance = null;
    }
    this._captureCallback = null;
  }
  /** No-op: @kmamal/sdl emits events automatically (no manual poll needed). */
  pollEvents() {
  }
  getAxisValue(joystick, axisId) {
    try {
      return joystick.axes[axisId] ?? 0;
    } catch {
      return 0;
    }
  }
  openJoystick(deviceId) {
    try {
      const device = sdl.joystick.devices.find((d) => d.id === deviceId);
      if (!device) return null;
      return sdl.joystick.openDevice(device);
    } catch {
      return null;
    }
  }
  closeJoystick(joystick) {
    try {
      if (!joystick.closed) joystick.close();
    } catch {
    }
  }
  getButtonState(joystick, buttonId) {
    try {
      return joystick.buttons[buttonId] ?? false;
    } catch {
      return false;
    }
  }
  isAxisActive(value) {
    return Math.abs(value) > AXIS_THRESHOLD$1;
  }
  isAxisResting(value) {
    return Math.abs(value) < AXIS_DEADZONE$1;
  }
}
const controllerService = new ControllerService();
const { keyboard, Key } = require("@nut-tree-fork/nut-js");
const { uIOhook, UiohookKey } = require("uiohook-napi");
function uiohookKeyName(keycode) {
  const entries = Object.entries(UiohookKey);
  const entry = entries.find(([, v]) => v === keycode);
  return entry ? entry[0] : null;
}
class KeyboardService {
  constructor() {
    this._capturing = false;
    this._captureCallback = null;
    this._heldModifiers = /* @__PURE__ */ new Set();
    this._captureListener = null;
  }
  /**
   * Press a key combo string like "ctrl+shift+a" or "F5".
   * Fires key down then key up via nut-js.
   */
  async pressCombo(combo) {
    const parts = combo.toLowerCase().split("+").map((p) => p.trim());
    const keys = [];
    for (const part of parts) {
      const key = this._resolveKey(part);
      if (key !== null) keys.push(key);
    }
    if (keys.length === 0) return;
    try {
      await keyboard.pressKey(...keys);
      await keyboard.releaseKey(...keys);
    } catch {
    }
  }
  startCapture(callback) {
    if (this._capturing) this.stopCapture();
    this._capturing = true;
    this._captureCallback = callback;
    this._heldModifiers.clear();
    this._captureListener = (e) => {
      const name = uiohookKeyName(e.keycode);
      if (!name) return;
      const MODIFIERS = ["Ctrl", "LeftCtrl", "RightCtrl", "Alt", "LeftAlt", "RightAlt", "Shift", "LeftShift", "RightShift", "Meta", "LeftMeta", "RightMeta"];
      const modAliases = {
        LeftCtrl: "ctrl",
        RightCtrl: "ctrl",
        LeftAlt: "alt",
        RightAlt: "alt",
        LeftShift: "shift",
        RightShift: "shift",
        LeftMeta: "meta",
        RightMeta: "meta",
        Ctrl: "ctrl",
        Alt: "alt",
        Shift: "shift",
        Meta: "meta"
      };
      if (MODIFIERS.includes(name)) {
        this._heldModifiers.add(modAliases[name]);
        return;
      }
      const parts = [...this._heldModifiers, name.toLowerCase()];
      const combo = parts.join("+");
      const cb = this._captureCallback;
      this.stopCapture();
      cb?.(combo);
    };
    uIOhook.on("keydown", this._captureListener);
    uIOhook.start();
  }
  stopCapture() {
    if (!this._capturing) return;
    this._capturing = false;
    if (this._captureListener) {
      uIOhook.off("keydown", this._captureListener);
      this._captureListener = null;
    }
    this._captureCallback = null;
    this._heldModifiers.clear();
    try {
      uIOhook.stop();
    } catch {
    }
  }
  _resolveKey(name) {
    const map = {
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
      f1: Key.F1,
      f2: Key.F2,
      f3: Key.F3,
      f4: Key.F4,
      f5: Key.F5,
      f6: Key.F6,
      f7: Key.F7,
      f8: Key.F8,
      f9: Key.F9,
      f10: Key.F10,
      f11: Key.F11,
      f12: Key.F12
    };
    if (map[name]) return map[name];
    if (name.length === 1) {
      const upper = name.toUpperCase();
      return Key[upper] ?? null;
    }
    return null;
  }
}
const keyboardService = new KeyboardService();
require("@kmamal/sdl");
const AXIS_THRESHOLD = 0.5;
const AXIS_DEADZONE = 0.15;
class Mapper {
  constructor(deviceId, mappings, onDisconnect, initialDelay = 0.4, repeatInterval = 0.05) {
    this._isActive = false;
    this._joystick = null;
    this._tickInterval = null;
    this._buttonMappings = /* @__PURE__ */ new Map();
    this._axisMappings = /* @__PURE__ */ new Map();
    this._diagonalMappings = [];
    this._heldKeys = /* @__PURE__ */ new Set();
    this._pressTime = /* @__PURE__ */ new Map();
    this._lastFire = /* @__PURE__ */ new Map();
    this._axisState = /* @__PURE__ */ new Map();
    this._deviceId = deviceId;
    this._onDisconnect = onDisconnect;
    this._initialDelay = initialDelay;
    this._repeatInterval = repeatInterval;
    this._buildMappings(mappings);
  }
  get isActive() {
    return this._isActive;
  }
  start() {
    if (this._isActive) return;
    this._joystick = controllerService.openJoystick(this._deviceId);
    if (!this._joystick) return;
    this._isActive = true;
    this._tickInterval = setInterval(() => this._tick(), 16);
  }
  stop() {
    if (this._tickInterval !== null) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    if (this._joystick) {
      controllerService.closeJoystick(this._joystick);
      this._joystick = null;
    }
    this._isActive = false;
    this._heldKeys.clear();
    this._pressTime.clear();
    this._lastFire.clear();
    this._axisState.clear();
  }
  _buildMappings(mappings) {
    this._buttonMappings.clear();
    this._axisMappings.clear();
    this._diagonalMappings = [];
    for (const m of mappings) {
      if (m.source_type === "button") {
        this._buttonMappings.set(m.button_id, { mapping: m });
      } else if (m.source_type === "axis") {
        const existing = this._axisMappings.get(m.button_id);
        if (existing) {
          existing.mappings.push(m);
        } else {
          this._axisMappings.set(m.button_id, { mappings: [m] });
        }
      } else if (m.source_type === "diagonal") {
        this._diagonalMappings.push(m);
      }
    }
  }
  _tick() {
    controllerService.pollEvents();
    this._processButtons();
    this._processAxes();
    this._processDiagonals();
  }
  _processButtons() {
    if (!this._joystick) return;
    const buttons = this._joystick.buttons;
    for (let btn = 0; btn < buttons.length; btn++) {
      const entry = this._buttonMappings.get(btn);
      if (!entry) continue;
      const pressed = buttons[btn] ?? false;
      const key = `btn:${btn}`;
      if (pressed) {
        this._handleHeld(key, entry.mapping.key_combo);
      } else {
        this._heldKeys.delete(key);
        this._pressTime.delete(key);
        this._lastFire.delete(key);
      }
    }
  }
  _processAxes() {
    if (!this._joystick) return;
    const axes = this._joystick.axes;
    for (let axisId = 0; axisId < axes.length; axisId++) {
      const entries = this._axisMappings.get(axisId);
      if (!entries) continue;
      const rawValue = axes[axisId] ?? 0;
      for (const m of entries.mappings) {
        const key = `axis:${axisId}:${m.axis_direction}`;
        const active = Math.abs(rawValue) > AXIS_THRESHOLD && (rawValue > 0 ? m.axis_direction > 0 : m.axis_direction < 0);
        if (active) {
          this._handleHeld(key, m.key_combo);
        } else {
          const wasActive = this._axisState.get(axisId) === m.axis_direction;
          if (wasActive && Math.abs(rawValue) < AXIS_DEADZONE) {
            this._heldKeys.delete(key);
            this._pressTime.delete(key);
            this._lastFire.delete(key);
            this._axisState.delete(axisId);
          }
        }
      }
    }
  }
  _processDiagonals() {
    if (!this._joystick || this._diagonalMappings.length === 0) return;
    const axes = this._joystick.axes;
    for (const m of this._diagonalMappings) {
      if (m.axis_id_y === null) continue;
      if (m.button_id >= axes.length || m.axis_id_y >= axes.length) continue;
      const vx = axes[m.button_id] ?? 0;
      const vy = axes[m.axis_id_y] ?? 0;
      const xActive = Math.abs(vx) > AXIS_THRESHOLD && (vx > 0 ? m.axis_direction > 0 : m.axis_direction < 0);
      const yActive = Math.abs(vy) > AXIS_THRESHOLD && (vy > 0 ? m.axis_direction_y > 0 : m.axis_direction_y < 0);
      const key = `diag:${m.button_id}:${m.axis_direction}:${m.axis_id_y}:${m.axis_direction_y}`;
      if (xActive && yActive) {
        this._handleHeld(key, m.key_combo);
      } else {
        const resting = Math.abs(vx) < AXIS_DEADZONE && Math.abs(vy) < AXIS_DEADZONE;
        if (resting) {
          this._heldKeys.delete(key);
          this._pressTime.delete(key);
          this._lastFire.delete(key);
        }
      }
    }
  }
  _handleHeld(key, combo) {
    const now = Date.now();
    if (!this._heldKeys.has(key)) {
      this._heldKeys.add(key);
      this._pressTime.set(key, now);
      this._lastFire.set(key, now);
      keyboardService.pressCombo(combo).catch(() => {
      });
      return;
    }
    const pressedAt = this._pressTime.get(key) ?? now;
    const lastFiredAt = this._lastFire.get(key) ?? now;
    const elapsed = (now - pressedAt) / 1e3;
    const sinceLast = (now - lastFiredAt) / 1e3;
    if (elapsed >= this._initialDelay && sinceLast >= this._repeatInterval) {
      this._lastFire.set(key, now);
      keyboardService.pressCombo(combo).catch(() => {
      });
    }
  }
}
const store = new Store({
  name: "controller-map",
  defaults: {
    config: { last_device_id: null, last_device_name: null },
    repeatSettings: { initial_delay_ms: 400, repeat_interval_ms: 50 },
    mappings: {}
  }
});
function loadConfig() {
  return store.get("config");
}
function saveConfig(config) {
  store.set("config", config);
}
function loadRepeatSettings() {
  return store.get("repeatSettings");
}
function saveRepeatSettings(settings) {
  store.set("repeatSettings", settings);
}
function loadMappings(deviceId) {
  const all = store.get("mappings");
  return all[String(deviceId)] ?? [];
}
function saveMappings(deviceId, mappings) {
  const all = store.get("mappings");
  all[String(deviceId)] = mappings;
  store.set("mappings", all);
}
let activeMapper = null;
let webContents = null;
function setWebContents(wc) {
  webContents = wc;
}
function handle(channel, fn) {
  electron.ipcMain.handle(
    channel,
    (_event, ...args) => (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fn(...args)
    )
  );
}
function registerIpcHandlers() {
  handle("controller:list", () => controllerService.getDevices());
  handle("controller:capture-start", (deviceId) => {
    controllerService.startCapture(deviceId, (result) => {
      webContents?.send("controller:button-captured", result);
    });
  });
  handle("controller:capture-stop", () => controllerService.stopCapture());
  handle("keyboard:capture-start", () => {
    keyboardService.startCapture((combo) => {
      webContents?.send("keyboard:key-captured", combo);
    });
  });
  handle("keyboard:capture-stop", () => keyboardService.stopCapture());
  handle("mapper:start", (deviceId, mappings, settings) => {
    if (activeMapper) {
      activeMapper.stop();
      activeMapper = null;
    }
    const mapper = new Mapper(
      deviceId,
      mappings,
      () => {
        webContents?.send("mapper:disconnected", void 0);
      },
      settings.initial_delay_ms / 1e3,
      settings.repeat_interval_ms / 1e3
    );
    mapper.start();
    if (!mapper.isActive) return false;
    activeMapper = mapper;
    return true;
  });
  handle("mapper:stop", () => {
    activeMapper?.stop();
    activeMapper = null;
  });
  handle("mapper:is-active", () => activeMapper?.isActive ?? false);
  handle("mappings:load", (deviceId) => loadMappings(deviceId));
  handle("mappings:save", (deviceId, mappings) => saveMappings(deviceId, mappings));
  handle("settings:load", () => loadRepeatSettings());
  handle("settings:save", (settings) => saveRepeatSettings(settings));
  handle("config:load", () => loadConfig());
  handle("config:save", (config) => saveConfig(config));
}
process.env["SDL_JOYSTICK_RAWINPUT"] = "1";
process.env["SDL_JOYSTICK_RAWINPUT_CORRELATE_XINPUT"] = "1";
const isDev = !electron.app.isPackaged;
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 680,
    height: 520,
    minWidth: 620,
    minHeight: 480,
    backgroundColor: "#f1f5f9",
    title: "controller-map",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  setWebContents(win.webContents);
  win.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (isDev) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"] ?? "http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
