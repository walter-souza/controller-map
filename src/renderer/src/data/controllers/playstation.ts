import type { ControllerProfile } from '../../../../shared/models'
import controllerImage from '../../assets/controllers/playstation.svg'

// PlayStation Controller Profile
// Button IDs are custom-tuned to match physical button outputs observed:
// Square=2, X=0, Circle=1, Triangle=3
// L1=9, R1=10, L2/R2 triggers as axes (axis 4 & 5)
// Share=4, Options=6, L3=7, R3=8, PS=5
// D-pad: Up=11, Down=12, Left=13, Right=14 (Simulated by hatMotion in controller-service.ts)
export const playstationController: ControllerProfile = {
  id: 'playstation',
  name: 'PlayStation Controller',
  namePatterns: ['playstation', 'dualshock', 'dualsense', 'ps4', 'ps5', 'wireless controller', 'sony'],
  imageUrl: controllerImage,
  sticks: [
    { name: 'LS', axis_x: 0, axis_y: 1 },
    { name: 'RS', axis_x: 2, axis_y: 3 },
  ],
  inputs: [
    // ── Shoulder buttons ──────────────────────────────────────────────────
    { type: 'axis',   axis_id: 4, direction:  1, name: 'L2',     x: 20.25, y: 13.0 },
    { type: 'button', id: 9,                     name: 'L1',     x: 20.5,  y: 22.5 },
    { type: 'axis',   axis_id: 5, direction:  1, name: 'R2',     x: 79.75, y: 13.0 },
    { type: 'button', id: 10,                    name: 'R1',     x: 79.5,  y: 22.5 },

    // ── Left stick axes ───────────────────────────────────────────────────
    { type: 'axis',   axis_id: 1, direction: -1, name: 'LS↑',   x: 37.5,  y: 56.6 },
    { type: 'axis',   axis_id: 0, direction: -1, name: 'LS←',   x: 30.5,  y: 64.6 },
    { type: 'button', id: 7,                     name: 'L3',     x: 37.5,  y: 64.6 },
    { type: 'axis',   axis_id: 0, direction:  1, name: 'LS→',   x: 44.5,  y: 64.6 },
    { type: 'axis',   axis_id: 1, direction:  1, name: 'LS↓',   x: 37.5,  y: 72.6 },

    // ── D-pad ─────────────────────────────────────────────────────────────
    { type: 'button', id: 11,                    name: 'D-Up',   x: 26.25, y: 35.8 },
    { type: 'button', id: 12,                    name: 'D-Down', x: 26.25, y: 52.7 },
    { type: 'button', id: 13,                    name: 'D-Left', x: 20.75, y: 44.2 },
    { type: 'button', id: 14,                    name: 'D-Right',x: 31.75, y: 44.2 },

    // ── Center buttons ────────────────────────────────────────────────────
    { type: 'button', id: 4,                     name: 'Share',  x: 31.25, y: 26.2 },
    { type: 'button', id: 5,                     name: 'PS',     x: 50.0,  y: 55.8 },
    { type: 'button', id: 6,                     name: 'Options', x: 68.75, y: 26.2 },

    // ── Face buttons ──────────────────────────────────────────────────────
    { type: 'button', id: 3,                     name: 'Triangle',x: 73.75, y: 35.8 },
    { type: 'button', id: 1,                     name: 'Circle',  x: 79.25, y: 44.2 },
    { type: 'button', id: 0,                     name: 'X',       x: 73.75, y: 52.7 },
    { type: 'button', id: 2,                     name: 'Square',  x: 68.25, y: 44.2 },

    // ── Right stick axes ──────────────────────────────────────────────────
    { type: 'axis',   axis_id: 3, direction: -1, name: 'RS↑',   x: 62.5,  y: 56.6 },
    { type: 'axis',   axis_id: 2, direction: -1, name: 'RS←',   x: 55.5,  y: 64.6 },
    { type: 'button', id: 8,                     name: 'R3',     x: 62.5,  y: 64.6 },
    { type: 'axis',   axis_id: 2, direction:  1, name: 'RS→',   x: 69.5,  y: 64.6 },
    { type: 'axis',   axis_id: 3, direction:  1, name: 'RS↓',   x: 62.5,  y: 72.6 },
  ],
}
