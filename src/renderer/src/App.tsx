import { useState, useEffect } from 'react'
import DeviceScreen from './screens/DeviceScreen'
import MappingScreen from './screens/MappingScreen'
import type { DeviceInfo } from '../../shared/models'

type Screen = { name: 'device' } | { name: 'mapping'; device: DeviceInfo }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'device' })

  // Restore last device on startup
  useEffect(() => {
    window.api.invoke('config:load').then((config) => {
      if (config.last_device_id !== null) {
        window.api.invoke('controller:list').then((devices) => {
          const found = devices.find((d) => d.id === config.last_device_id)
          if (found) setScreen({ name: 'mapping', device: found })
        })
      }
    })
  }, [])

  if (screen.name === 'mapping') {
    return (
      <MappingScreen
        device={screen.device}
        onBack={() => setScreen({ name: 'device' })}
      />
    )
  }

  return (
    <DeviceScreen
      onSelect={(device) => {
        window.api.invoke('config:save', {
          last_device_id: device.id,
          last_device_name: device.name,
        })
        setScreen({ name: 'mapping', device })
      }}
    />
  )
}
