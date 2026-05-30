// Typed IPC channel definitions
import type { AngleMappingConfig, AppConfig, CaptureResult, DeviceInfo, Mapping, MappingProfile, RepeatSettings } from './models'

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
  'settings:load': { args: []; result: RepeatSettings }
  'settings:save': { args: [settings: RepeatSettings]; result: void }
  'config:load': { args: []; result: AppConfig }
  'config:save': { args: [config: AppConfig]; result: void }
  // Profile management
  'profiles:load-all':  { args: []; result: { profiles: MappingProfile[]; activeProfileId: string } }
  'profiles:set-active':{ args: [id: string]; result: void }
  'profiles:create':    { args: [name: string]; result: { profiles: MappingProfile[]; activeProfileId: string } }
  'profiles:update':    { args: [profile: MappingProfile]; result: void }
  'profiles:delete':    { args: [id: string]; result: { profiles: MappingProfile[]; activeProfileId: string } }
  'profiles:export':    { args: [id: string]; result: boolean }
  'profiles:import':    { args: []; result: MappingProfile | null }
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
