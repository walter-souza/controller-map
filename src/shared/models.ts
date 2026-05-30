// Shared data models — mirroring Python models.py

// A single controller input within a chord (button or axis only — not diagonal)
export interface ChordInput {
  type: 'button' | 'axis'
  button_id: number       // button index or axis index
  button_name: string
  axis_direction?: number // +1 or -1 for axes; omit for buttons
}

export interface Mapping {
  button_id: number
  button_name: string
  key_combo: string
  source_type: 'button' | 'axis' | 'diagonal'
  axis_direction: number   // +1 or -1 for axes; 0 for buttons
  axis_id_y: number | null // secondary axis for diagonals
  axis_direction_y: number
  // Optional additional inputs that must all be held simultaneously
  chord_inputs?: ChordInput[]
}

export interface RepeatSettings {
  initial_delay_ms: number   // default 400
  repeat_interval_ms: number // default 50
}

export interface AppConfig {
  last_device_id: number | null
  last_device_name: string | null
}

export interface DeviceInfo {
  id: number
  name: string
}

// Angle (joystick radial) mapping
export interface AngleNode {
  id: string
  angle: number // degrees: 0=right, 90=up, 180=left, 270=down
}

export interface AngleRegion {
  id: string
  key_combos: string[]
}

export interface AngleMappingConfig {
  id: string
  axis_x: number     // joystick axis index for horizontal
  axis_y: number     // joystick axis index for vertical (SDL positive=down)
  deadzone: number   // magnitude threshold 0..1
  nodes: AngleNode[] // sorted ascending by angle; N nodes → N regions
  regions: AngleRegion[] // region[i] spans nodes[i].angle → nodes[(i+1)%N].angle
}

// Controller profile system — for known controllers with visual mapping UI

export interface ControllerButtonDef {
  type: 'button'
  id: number        // SDL button_id
  name: string      // Display name: "A", "L1", "D-Up"
  x: number         // % from left (0-100) relative to profile image
  y: number         // % from top (0-100) relative to profile image
}

export interface ControllerAxisDef {
  type: 'axis'
  axis_id: number   // SDL axis index
  direction: 1 | -1 // +1 or -1
  name: string      // Display name: "L2", "R2"
  x: number
  y: number
}

export type ControllerInputDef = ControllerButtonDef | ControllerAxisDef

export interface StickDef {
  name: string    // Display name: "LS" | "RS"
  axis_x: number  // axis_id for horizontal (SDL: -1=left, +1=right)
  axis_y: number  // axis_id for vertical   (SDL: -1=up,   +1=down)
}

export interface ControllerProfile {
  id: string
  name: string
  namePatterns: string[]  // case-insensitive substrings matched against device name
  imageUrl: string        // import URL (from renderer assets)
  inputs: ControllerInputDef[]
  sticks?: StickDef[]     // joystick stick definitions for pad visualization
}

export interface MappingProfile {
  id: string
  name: string
  mappings: Mapping[]
  angleMappings: AngleMappingConfig[]
  createdAt: string // ISO timestamp
}

// Controller capture result
export type CaptureResult =
  | { type: 'button'; button_id: number; button_name: string }
  | { type: 'axis'; button_id: number; button_name: string; axis_direction: number }
  | {
      type: 'diagonal'
      button_id: number
      button_name: string
      axis_direction: number
      axis_id_y: number
      axis_direction_y: number
    }
