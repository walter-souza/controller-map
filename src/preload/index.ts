import { contextBridge, ipcRenderer } from 'electron'
import type { IpcEventChannel, IpcEventMap, IpcInvokeChannel, IpcInvokeMap } from '../shared/ipc'

const api = {
  platform: process.platform,
  invoke<C extends IpcInvokeChannel>(
    channel: C,
    ...args: IpcInvokeMap[C]['args']
  ): Promise<IpcInvokeMap[C]['result']> {
    return ipcRenderer.invoke(channel, ...args)
  },
  on<C extends IpcEventChannel>(
    channel: C,
    listener: (payload: IpcEventMap[C]) => void,
  ): () => void {
    const wrapped = (_: Electron.IpcRendererEvent, payload: IpcEventMap[C]) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
