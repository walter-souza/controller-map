import Store from 'electron-store'
import type { AngleMappingConfig, AppConfig, Mapping, RepeatSettings } from '../shared/models'

interface StoreSchema {
  config: AppConfig
  repeatSettings: RepeatSettings
  mappings: Record<string, Mapping[]>
  angleMappings: Record<string, AngleMappingConfig[]>
}

const store = new Store<StoreSchema>({
  name: 'controller-map',
  defaults: {
    config: { last_device_id: null, last_device_name: null },
    repeatSettings: { initial_delay_ms: 400, repeat_interval_ms: 50 },
    mappings: {},
    angleMappings: {},
  },
})

export function loadConfig(): AppConfig {
  return store.get('config')
}

export function saveConfig(config: AppConfig): void {
  store.set('config', config)
}

export function loadRepeatSettings(): RepeatSettings {
  return store.get('repeatSettings')
}

export function saveRepeatSettings(settings: RepeatSettings): void {
  store.set('repeatSettings', settings)
}

export function loadMappings(deviceId: number): Mapping[] {
  const all = store.get('mappings')
  return all[String(deviceId)] ?? []
}

export function saveMappings(deviceId: number, mappings: Mapping[]): void {
  const all = store.get('mappings')
  all[String(deviceId)] = mappings
  store.set('mappings', all)
}

export function loadAngleMappings(deviceId: number): AngleMappingConfig[] {
  const all = store.get('angleMappings')
  return all[String(deviceId)] ?? []
}

export function saveAngleMappings(deviceId: number, configs: AngleMappingConfig[]): void {
  const all = store.get('angleMappings')
  all[String(deviceId)] = configs
  store.set('angleMappings', all)
}
