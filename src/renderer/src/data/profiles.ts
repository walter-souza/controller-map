import type { ControllerProfile } from '../../../shared/models'
import { eightbitdoUltimate } from './controllers/eightbitdo-ultimate'
import { playstationController } from './controllers/playstation'

export const KNOWN_PROFILES: ControllerProfile[] = [eightbitdoUltimate, playstationController]

export function detectProfile(deviceName: string): ControllerProfile {
  const lower = deviceName.toLowerCase()
  return KNOWN_PROFILES.find((p) => p.namePatterns.some((pattern) => lower.includes(pattern))) ?? KNOWN_PROFILES[0]
}
