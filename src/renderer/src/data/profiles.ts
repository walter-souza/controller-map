import type { ControllerProfile } from '../../../shared/models'
import { eightbitdoUltimate } from './controllers/eightbitdo-ultimate'

export const KNOWN_PROFILES: ControllerProfile[] = [eightbitdoUltimate]

export function detectProfile(deviceName: string): ControllerProfile | null {
  const lower = deviceName.toLowerCase()
  return KNOWN_PROFILES.find((p) => p.namePatterns.some((pattern) => lower.includes(pattern))) ?? null
}
