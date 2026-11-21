import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const bridge = {
  call: async (method: string, ...args: unknown[]) => {
    const r = await ipcRenderer.invoke('api', method, ...args)
    if (!r.ok) throw new Error(r.error)
    return r.value
  },
  on: (channel: 'state' | 'log' | 'logs-reset' | 'navigate', fn: (payload: any) => void) => {
    const h = (_e: IpcRendererEvent, payload: unknown) => fn(payload)
    ipcRenderer.on(channel, h)
    return () => ipcRenderer.removeListener(channel, h)
  }
}

contextBridge.exposeInMainWorld('tf', bridge)
export type Bridge = typeof bridge
