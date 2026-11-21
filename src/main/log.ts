import { Notification } from 'electron'
import { store } from './store'
import { LogCategory, LogEntry } from '../shared/types'

type Extra = Partial<Pick<LogEntry, 'accountId' | 'postId' | 'details' | 'screenshot' | 'data'>>

export const log = {
  info: (category: LogCategory, message: string, extra: Extra = {}) =>
    store.addLog({ level: 'info', category, message, ...extra }),
  warn: (category: LogCategory, message: string, extra: Extra = {}) =>
    store.addLog({ level: 'warn', category, message, ...extra }),
  error: (category: LogCategory, message: string, extra: Extra = {}) =>
    store.addLog({ level: 'error', category, message, ...extra })
}

let onClick: ((target: string) => void) | null = null
export function setNotificationHandler(fn: (target: string) => void): void {
  onClick = fn
}

export function notify(kind: 'failure' | 'disconnected' | 'success', title: string, body: string, target = 'posts'): void {
  const s = store.db.settings
  if (kind === 'failure' && !s.notifyFailure) return
  if (kind === 'disconnected' && !s.notifyDisconnected) return
  if (kind === 'success' && !s.notifySuccess) return
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, silent: !s.notifySound })
  n.on('click', () => onClick?.(target))
  n.show()
}
