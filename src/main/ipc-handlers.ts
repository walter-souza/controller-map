import { ipcMain, WebContents } from 'electron'
import type { IpcInvokeMap } from '../shared/ipc'
import { controllerService } from './controller-service'
import { keyboardService } from './keyboard-service'
import { Mapper } from './mapper'
import * as persistence from './persistence'

let activeMapper: Mapper | null = null
let webContents: WebContents | null = null

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

  handle('keyboard:capture-start', () => {
    keyboardService.startCapture((combo) => {
      webContents?.send('keyboard:key-captured', combo)
    })
  })

  handle('keyboard:capture-stop', () => keyboardService.stopCapture())

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
