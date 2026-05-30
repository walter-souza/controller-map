import { dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import Store from 'electron-store'
import type { AngleMappingConfig, AngleRegion, AppConfig, Mapping, MappingProfile, RepeatSettings } from '../shared/models'

interface StoreSchema {
  config: AppConfig
  repeatSettings: RepeatSettings
  profiles: MappingProfile[]
  activeProfileId: string | null
  // Legacy fields — present only before migration
  mappings?: Record<string, Mapping[]>
  angleMappings?: Record<string, AngleMappingConfig[]>
}

const store = new Store<StoreSchema>({
  name: 'controller-map',
  defaults: {
    config: { last_device_id: null, last_device_name: null },
    repeatSettings: { initial_delay_ms: 400, repeat_interval_ms: 50 },
    profiles: [],
    activeProfileId: null,
  },
})

// ── Migration + invariant enforcement ────────────────────────────────────────

function makeDefaultProfile(mappings: Mapping[] = [], angleMappings: AngleMappingConfig[] = []): MappingProfile {
  return {
    id: crypto.randomUUID(),
    name: 'Default',
    mappings,
    angleMappings,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Ensures the store always has a valid, non-empty profiles list and a valid
 * activeProfileId. Migrates legacy per-device data on first run.
 */
function ensureProfiles(): { profiles: MappingProfile[]; activeProfileId: string } {
  let profiles = store.get('profiles') as MappingProfile[]
  let activeProfileId = store.get('activeProfileId') as string | null

  // ── Migration from legacy per-device storage ──────────────────────────────
  const legacyMappings = store.get('mappings') as Record<string, Mapping[]> | undefined
  if ((!profiles || profiles.length === 0) && legacyMappings) {
    const config = store.get('config')
    const lastDeviceId = config?.last_device_id
    const legacyAngle = store.get('angleMappings') as Record<string, AngleMappingConfig[]> | undefined

    const mappings: Mapping[] = lastDeviceId != null ? (legacyMappings[String(lastDeviceId)] ?? []) : []
    const angleMappings: AngleMappingConfig[] = lastDeviceId != null ? (legacyAngle?.[String(lastDeviceId)] ?? []) : []

    const defaultProfile = makeDefaultProfile(mappings, angleMappings)
    profiles = [defaultProfile]
    activeProfileId = defaultProfile.id

    store.set('profiles', profiles)
    store.set('activeProfileId', activeProfileId)
    // Remove legacy keys
    store.delete('mappings' as keyof StoreSchema)
    store.delete('angleMappings' as keyof StoreSchema)
  }

  // ── Migrate legacy key_combo (string) → key_combos (string[]) ────────────
  let migrated = false
  profiles = profiles.map((p) => ({
    ...p,
    angleMappings: p.angleMappings.map((cfg) => ({
      ...cfg,
      regions: cfg.regions.map((r: AngleRegion & { key_combo?: string }) => {
        if (Array.isArray(r.key_combos)) return r
        migrated = true
        return { id: r.id, key_combos: r.key_combo ? [r.key_combo] : [] }
      }),
    })),
  }))
  if (migrated) store.set('profiles', profiles)

  // ── Ensure at least one profile exists ───────────────────────────────────
  if (!profiles || profiles.length === 0) {
    const defaultProfile = makeDefaultProfile()
    profiles = [defaultProfile]
    activeProfileId = defaultProfile.id
    store.set('profiles', profiles)
    store.set('activeProfileId', activeProfileId)
  }

  // ── Ensure activeProfileId points to an existing profile ─────────────────
  const ids = new Set(profiles.map((p) => p.id))
  if (!activeProfileId || !ids.has(activeProfileId)) {
    activeProfileId = profiles[0].id
    store.set('activeProfileId', activeProfileId)
  }

  return { profiles, activeProfileId }
}

// ── Profile CRUD ──────────────────────────────────────────────────────────────

export function loadAllProfiles(): { profiles: MappingProfile[]; activeProfileId: string } {
  return ensureProfiles()
}

export function saveAllProfiles(profiles: MappingProfile[]): void {
  store.set('profiles', profiles)
}

export function getActiveProfileId(): string | null {
  return store.get('activeProfileId')
}

export function setActiveProfileId(id: string): void {
  store.set('activeProfileId', id)
}

// ── Export / Import ───────────────────────────────────────────────────────────

interface ExportFile {
  version: 1
  exportedAt: string
  profile: {
    name: string
    mappings: Mapping[]
    angleMappings: AngleMappingConfig[]
  }
}

export async function exportProfileToFile(profile: MappingProfile): Promise<boolean> {
  const result = await dialog.showSaveDialog({
    title: 'Exportar perfil',
    defaultPath: `${profile.name}.json`,
    filters: [{ name: 'Perfil JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return false

  const exportData: ExportFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: {
      name: profile.name,
      mappings: profile.mappings,
      angleMappings: profile.angleMappings,
    },
  }
  writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
  return true
}

export async function importProfileFromFile(): Promise<MappingProfile | null> {
  const result = await dialog.showOpenDialog({
    title: 'Importar perfil',
    filters: [{ name: 'Perfil JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(result.filePaths[0], 'utf-8'))
  } catch {
    return null // invalid JSON
  }

  if (!isValidExportFile(parsed)) return null

  const filePath = result.filePaths[0]
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? ''
  const nameFromFile = fileName.replace(/\.json$/i, '').trim() || (parsed as ExportFile).profile.name

  const file = parsed as ExportFile
  return {
    id: crypto.randomUUID(),
    name: nameFromFile,
    mappings: file.profile.mappings,
    angleMappings: file.profile.angleMappings,
    createdAt: new Date().toISOString(),
  }
}

function isValidExportFile(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (d.version !== 1) return false
  if (typeof d.profile !== 'object' || d.profile === null) return false
  const p = d.profile as Record<string, unknown>
  if (typeof p.name !== 'string' || !p.name.trim()) return false
  if (!Array.isArray(p.mappings)) return false
  if (!Array.isArray(p.angleMappings)) return false
  return true
}

// ── Legacy helpers (settings + config — unchanged) ───────────────────────────

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
