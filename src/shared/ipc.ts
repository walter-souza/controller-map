// Typed IPC channel definitions
import type { AngleMappingConfig, AppConfig, CaptureResult, DeviceInfo, Mapping, RepeatSettings } from './models'

// Invoke channels (renderer → main, returns Promise)
export interface IpcInvokeMap {
  'controller:list': { args: []; result: DeviceInfo[] }
  'controller:capture-start': { args: [deviceId: number]; result: void }
  'controller:capture-stop': { args: []; result: void }
  'controller:chord-capture-start': { args: [deviceId: number]; result: void }
  'controller:chord-capture-stop': { args: []; result: void }
  'controller:monitor-start': { args: [deviceId: number]; result: void }
  'controller:monitor-stop': { args: []; result: void }
  'keyboard:capture-start': { args: []; result: void }
  'keyboard:capture-stop': { args: []; result: void }
  'mapper:start': {
    args: [deviceId: number, mappings: Mapping[], settings: RepeatSettings, angleMappings: AngleMappingConfig[]]
    result: boolean // false if device could not be opened
  }
  'mapper:stop': { args: []; result: void }
  'mapper:is-active': { args: []; result: boolean }
  'mappings:load': { args: [deviceId: number]; result: Mapping[] }
  'mappings:save': { args: [deviceId: number, mappings: Mapping[]]; result: void }
  'angle-mappings:load': { args: [deviceId: number]; result: AngleMappingConfig[] }
  'angle-mappings:save': { args: [deviceId: number, configs: AngleMappingConfig[]]; result: void }
  'settings:load': { args: []; result: RepeatSettings }
  'settings:save': { args: [settings: RepeatSettings]; result: void }
  'config:load': { args: []; result: AppConfig }
  'config:save': { args: [config: AppConfig]; result: void }
}

// Event channels (main → renderer, via on/removeListener)
export interface IpcEventMap {
  'controller:button-captured': CaptureResult
  'controller:chord-captured': CaptureResult[]  // all buttons held simultaneously
  'keyboard:key-captured': string // e.g. "ctrl+shift+a"
  'mapper:disconnected': void
  'controller:button-down': { button: number }
  'controller:button-up': { button: number }
  'controller:axis-motion': { axis: number; value: number }
}

export type IpcInvokeChannel = keyof IpcInvokeMap
export type IpcEventChannel = keyof IpcEventMap
