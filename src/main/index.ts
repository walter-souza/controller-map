// CRITICAL: Set SDL_JOYSTICK_RAWINPUT before any require() of node-sdl.
// This allows reading controller events even when 8BitDo Software / Steam
// holds an exclusive XInput lock on the device.
process.env['SDL_JOYSTICK_RAWINPUT'] = '1'
process.env['SDL_JOYSTICK_RAWINPUT_CORRELATE_XINPUT'] = '1'

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers, setWebContents } from './ipc-handlers'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 680,
    height: 520,
    minWidth: 620,
    minHeight: 480,
    backgroundColor: '#f1f5f9',
    title: 'controller-map',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  setWebContents(win.webContents)

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
