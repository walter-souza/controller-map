// Shared data models — mirroring Python models.py

export interface Mapping {
  button_id: number
  button_name: string
  key_combo: string
  source_type: 'button' | 'axis' | 'diagonal'
  axis_direction: number   // +1 or -1 for axes; 0 for buttons
  axis_id_y: number | null // secondary axis for diagonals
  axis_direction_y: number
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
