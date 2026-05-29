import type { ControllerProfile } from '../../../../shared/models'
import controllerImage from '../../assets/controllers/8bitdo-ultimate.svg'

// Button IDs are for XInput/2.4G mode on Windows (SDL standard mapping).
// In Switch or Android mode, some IDs may differ — verify with the capture tool if needed.
export const eightbitdoUltimate: ControllerProfile = {
  id: 'eightbitdo-ultimate',
  name: '8BitDo Ultimate',
  namePatterns: ['8bitdo', '8bit do', 'ultimate wireless', 'ultimate 2'],
  imageUrl: controllerImage,
  inputs: [
    // ── Shoulder buttons ──────────────────────────────────────────────────
    { type: 'axis',   axis_id: 4, direction:  1, name: 'L2',     x: 20.75, y: 11.5 },
    { type: 'button', id: 9,                     name: 'L1',     x: 21.25, y: 21.5 },
    { type: 'axis',   axis_id: 5, direction:  1, name: 'R2',     x: 79.25, y: 11.5 },
    { type: 'button', id: 10,                    name: 'R1',     x: 78.75, y: 21.5 },

    // ── Left stick ────────────────────────────────────────────────────────
    { type: 'button', id: 7,                     name: 'L3',     x: 38.75, y: 45.4 },

    // ── D-pad ─────────────────────────────────────────────────────────────
    { type: 'button', id: 11,                    name: 'D-Up',   x: 27.5,  y: 52.3 },
    { type: 'button', id: 12,                    name: 'D-Down', x: 27.5,  y: 70.8 },
    { type: 'button', id: 13,                    name: 'D-Left', x: 20.75, y: 62.3 },
    { type: 'button', id: 14,                    name: 'D-Right',x: 33.5,  y: 62.3 },

    // ── Center buttons ────────────────────────────────────────────────────
    { type: 'button', id: 4,                     name: 'Select', x: 44.25, y: 40.4 },
    { type: 'button', id: 6,                     name: 'Home',   x: 50,    y: 33.8 },
    { type: 'button', id: 5,                     name: 'Start',  x: 55.75, y: 40.4 },

    // ── Face buttons ──────────────────────────────────────────────────────
    { type: 'button', id: 3,                     name: 'Y',      x: 73.0,  y: 38.5 },
    { type: 'button', id: 1,                     name: 'B',      x: 78.75, y: 46.9 },
    { type: 'button', id: 0,                     name: 'A',      x: 73.0,  y: 55.4 },
    { type: 'button', id: 2,                     name: 'X',      x: 67.25, y: 46.9 },

    // ── Right stick ───────────────────────────────────────────────────────
    { type: 'button', id: 8,                     name: 'R3',     x: 64.5,  y: 62.3 },
  ],
}
