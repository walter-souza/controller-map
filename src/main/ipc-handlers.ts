import { ipcMain, WebContents } from 'electron'
import type { IpcInvokeMap } from '../shared/ipc'
import { controllerService } from './controller-service'
import { keyboardService } from './keyboard-service'
import { Mapper } from './mapper'
import * as persistence from './persistence'

let activeMapper: Mapper | null = null
let webContents: WebContents | null = null

// Suppress keyboard shortcuts (e.g. Ctrl+W closes window) while capturing keys.
// Electron fires 'before-input-event' before any default handling occurs.
type InputEvent = Parameters<Parameters<WebContents['on']>[1]>[1]
let _suppressInputHandler: ((event: Electron.Event, input: InputEvent) => void) | null = null

function startInputSuppression(): void {
  if (!webContents || _suppressInputHandler) return
  _suppressInputHandler = (event, input) => {
    if (input.type !== 'keyDown') return
    // Block shortcuts that could close or disrupt the window during capture
    const ctrl = input.control || input.meta
    if (ctrl && ['w', 'q', 'r', 'n', 't'].includes(input.key.toLowerCase())) {
      event.preventDefault()
    }
    if (input.key === 'F5' || (ctrl && input.key === 'F5')) {
      event.preventDefault()
    }
  }
  webContents.on('before-input-event', _suppressInputHandler)
}

function stopInputSuppression(): void {
  if (!webContents || !_suppressInputHandler) return
  webContents.off('before-input-event', _suppressInputHandler)
  _suppressInputHandler = null
}

export function setWebContents(wc: WebContents): void {
  webContents = wc
}

function handle<C extends keyof IpcInvokeMap>(
  channel: C,
  fn: (...args: IpcInvokeMap[C]['args']) => Promise<IpcInvokeMap[C]['result']> | IpcInvokeMap[C]['result'],
): void {
  ipcMain.handle(channel, (_event, ...args) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn(...(args as any)),
  )
}

export function registerIpcHandlers(): void {
  // Pre-open all connected joystick devices so SDL can resolve instance IDs
  // before the renderer starts polling. This prevents SDL_JoystickFromInstanceID errors.
  controllerService.getDevices()

  handle('controller:list', () => controllerService.getDevices())

  handle('controller:capture-start', (deviceId) => {
    controllerService.startCapture(deviceId, (result) => {
      webContents?.send('controller:button-captured', result)
    })
  })

  handle('controller:capture-stop', () => controllerService.stopCapture())

  handle('controller:chord-capture-start', (deviceId) => {
    controllerService.startChordCapture(deviceId, (results) => {
      webContents?.send('controller:chord-captured', results)
    })
  })

  handle('controller:chord-capture-stop', () => controllerService.stopChordCapture())

  handle('controller:monitor-start', (deviceId) => {
    controllerService.startMonitor(
      deviceId,
      (button) => webContents?.send('controller:button-down', { button }),
      (button) => webContents?.send('controller:button-up', { button }),
      (axis, value) => webContents?.send('controller:axis-motion', { axis, value }),
    )
  })

  handle('controller:monitor-stop', () => controllerService.stopMonitor())

  handle('keyboard:capture-start', () => {
    keyboardService.startCapture((combo) => {
      stopInputSuppression()
      webContents?.send('keyboard:key-captured', combo)
    })
  })

  handle('keyboard:capture-stop', () => {
    stopInputSuppression()
    keyboardService.stopCapture()
  })

  handle('mapper:start', (deviceId, mappings, settings, angleMappings) => {
    if (activeMapper) {
      activeMapper.stop()
      activeMapper = null
    }
    const mapper = new Mapper(
      deviceId,
      mappings,
      () => {
        webContents?.send('mapper:disconnected', undefined)
      },
      settings.initial_delay_ms / 1000,
      settings.repeat_interval_ms / 1000,
      angleMappings,
    )
    mapper.start()
    if (!mapper.isActive) return false
    activeMapper = mapper
    return true
  })

  handle('mapper:stop', () => {
    activeMapper?.stop()
    activeMapper = null
  })

  handle('mapper:is-active', () => activeMapper?.isActive ?? false)

  handle('mappings:load', (deviceId) => persistence.loadMappings(deviceId))

  handle('mappings:save', (deviceId, mappings) => persistence.saveMappings(deviceId, mappings))

  handle('angle-mappings:load', (deviceId) => persistence.loadAngleMappings(deviceId))

  handle('angle-mappings:save', (deviceId, configs) => persistence.saveAngleMappings(deviceId, configs))

  handle('settings:load', () => persistence.loadRepeatSettings())

  handle('settings:save', (settings) => persistence.saveRepeatSettings(settings))

  handle('config:load', () => persistence.loadConfig())

  handle('config:save', (config) => persistence.saveConfig(config))
}
