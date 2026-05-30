import type { ControllerProfile } from '../../../../shared/models'
import controllerImage from '../../assets/controllers/8bitdo-ultimate.svg'

// Button IDs follow standard XInput/SDL mapping on Windows (2.4G mode):
// A=0, B=1, X=2, Y=3, LB=4, RB=5, Back=6, Start=7, LS=8, RS=9, Guide=10
// D-pad: Up=11, Down=12, Left=13, Right=14
export const eightbitdoUltimate: ControllerProfile = {
  id: 'eightbitdo-ultimate',
  name: '8BitDo Ultimate',
  namePatterns: ['8bitdo', '8bit do', 'ultimate wireless', 'ultimate 2'],
  imageUrl: controllerImage,
  sticks: [
    { name: 'LS', axis_x: 0, axis_y: 1 },
    { name: 'RS', axis_x: 2, axis_y: 3 },
  ],
  inputs: [
    // ── Shoulder buttons ──────────────────────────────────────────────────
    { type: 'axis',   axis_id: 4, direction:  1, name: 'L2',     x: 20.75, y: 11.5 },
    { type: 'button', id: 4,                     name: 'L1',     x: 21.25, y: 21.5 },
    { type: 'axis',   axis_id: 5, direction:  1, name: 'R2',     x: 79.25, y: 11.5 },
    { type: 'button', id: 5,                     name: 'R1',     x: 78.75, y: 21.5 },

    // ── Left stick axes ───────────────────────────────────────────────────
    { type: 'axis',   axis_id: 1, direction: -1, name: 'LS↑',   x: 38.75, y: 37.5 },
    { type: 'axis',   axis_id: 0, direction: -1, name: 'LS←',   x: 31.5,  y: 45.4 },
    { type: 'button', id: 8,                     name: 'L3',     x: 38.75, y: 45.4 },
    { type: 'axis',   axis_id: 0, direction:  1, name: 'LS→',   x: 46.0,  y: 45.4 },
    { type: 'axis',   axis_id: 1, direction:  1, name: 'LS↓',   x: 38.75, y: 53.0 },

    // ── D-pad ─────────────────────────────────────────────────────────────
    { type: 'button', id: 11,                    name: 'D-Up',   x: 27.5,  y: 52.3 },
    { type: 'button', id: 12,                    name: 'D-Down', x: 27.5,  y: 70.8 },
    { type: 'button', id: 13,                    name: 'D-Left', x: 20.75, y: 62.3 },
    { type: 'button', id: 14,                    name: 'D-Right',x: 33.5,  y: 62.3 },

    // ── Center buttons ────────────────────────────────────────────────────
    { type: 'button', id: 6,                     name: 'Select', x: 44.25, y: 40.4 },
    { type: 'button', id: 10,                    name: 'Home',   x: 50,    y: 33.8 },
    { type: 'button', id: 7,                     name: 'Start',  x: 55.75, y: 40.4 },

    // ── Face buttons ──────────────────────────────────────────────────────
    { type: 'button', id: 3,                     name: 'Y',      x: 73.0,  y: 38.5 },
    { type: 'button', id: 1,                     name: 'B',      x: 78.75, y: 46.9 },
    { type: 'button', id: 0,                     name: 'A',      x: 73.0,  y: 55.4 },
    { type: 'button', id: 2,                     name: 'X',      x: 67.25, y: 46.9 },

    // ── Right stick axes ──────────────────────────────────────────────────
    { type: 'axis',   axis_id: 3, direction: -1, name: 'RS↑',   x: 64.5,  y: 54.5 },
    { type: 'axis',   axis_id: 2, direction: -1, name: 'RS←',   x: 57.5,  y: 62.3 },
    { type: 'button', id: 9,                     name: 'R3',     x: 64.5,  y: 62.3 },
    { type: 'axis',   axis_id: 2, direction:  1, name: 'RS→',   x: 71.5,  y: 62.3 },
    { type: 'axis',   axis_id: 3, direction:  1, name: 'RS↓',   x: 64.5,  y: 70.5 },
  ],
}
