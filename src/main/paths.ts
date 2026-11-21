import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

let base = ''

export function dataDir(): string {
  if (!base) {
    base = join(app.getPath('userData'), 'data')
    for (const d of ['', 'sessions', 'media', 'screenshots', 'backups']) mkdirSync(join(base, d), { recursive: true })
  }
  return base
}

export const p = {
  db: () => join(dataDir(), 'db.json'),
  logs: () => join(dataDir(), 'logs.json'),
  sessions: () => join(dataDir(), 'sessions'),
  session: (accountId: string) => join(dataDir(), 'sessions', `${accountId}.bin`),
  media: () => join(dataDir(), 'media'),
  screenshots: () => join(dataDir(), 'screenshots'),
  selectors: () => join(dataDir(), 'selectors.json')
}
