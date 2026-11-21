import { useEffect, useState, useSyncExternalStore } from 'react'
import type { AppState, LogEntry, NewPostInput, PickedFile, PostPatch, Settings } from '@shared/types'

declare global {
  interface Window {
    tf: {
      call: (method: string, ...args: unknown[]) => Promise<any>
      on: (channel: 'state' | 'log' | 'logs-reset' | 'navigate', fn: (payload: any) => void) => () => void
    }
  }
}

const call = <T = unknown>(m: string, ...a: unknown[]) => window.tf.call(m, ...a) as Promise<T>

export const api = {
  connectAccount: () => call<{ ok: boolean; error?: string; accountId?: string }>('connectAccount'),
  reconnectAccount: (id: string) => call<{ ok: boolean; error?: string }>('reconnectAccount', id),
  cancelConnect: () => call('cancelConnect'),
  verifyAccount: (id: string) => call<boolean>('verifyAccount', id),
  verifyAll: () => call('verifyAll'),
  updateAccount: (id: string, patch: { handle?: string; name?: string; paused?: boolean }) => call('updateAccount', id, patch),
  removeAccount: (id: string, deletePosts: boolean) => call('removeAccount', id, deletePosts),
  refreshMetrics: (accountId?: string) => call('refreshMetrics', accountId),
  createPosts: (input: NewPostInput) => call<string[]>('createPosts', input),
  updatePost: (id: string, patch: PostPatch) => call('updatePost', id, patch),
  deletePost: (id: string) => call('deletePost', id),
  duplicatePost: (id: string) => call<string>('duplicatePost', id),
  cancelPost: (id: string) => call('cancelPost', id),
  retryPost: (id: string) => call('retryPost', id),
  publishNow: (id: string) => call('publishNow', id),
  pickMedia: () => call<PickedFile[]>('pickMedia'),
  updateSettings: (patch: Partial<Settings>) => call('updateSettings', patch),
  clearLogs: (days: number) => call<number>('clearLogs', days),
  exportLogs: (format: 'json' | 'csv') => call<boolean>('exportLogs', format),
  exportBackup: () => call<boolean>('exportBackup'),
  restoreBackup: () => call<boolean>('restoreBackup'),
  openDataFolder: () => call('openDataFolder'),
  openPath: (path: string) => call('openPath', path),
  openExternal: (url: string) => call('openExternal', url),
  redetectBrowser: () => call<boolean>('redetectBrowser')
}

// ---------- estado global ----------
let state: AppState | null = null
const listeners = new Set<() => void>()
function setState(s: AppState) {
  state = s
  listeners.forEach((l) => l())
}
let started = false
function start() {
  if (started) return
  started = true
  window.tf.call('getState').then(setState)
  window.tf.on('state', setState)
}

export function useAppState(): AppState | null {
  start()
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state
  )
}

export function useLogs(): LogEntry[] {
  const [logs, setLogs] = useState<LogEntry[]>([])
  useEffect(() => {
    let alive = true
    const load = () => window.tf.call('getLogs').then((l) => alive && setLogs(l))
    load()
    const off1 = window.tf.on('log', (entry: LogEntry) => setLogs((prev) => [entry, ...prev].slice(0, 5000)))
    const off2 = window.tf.on('logs-reset', load)
    return () => {
      alive = false
      off1()
      off2()
    }
  }, [])
  return logs
}
