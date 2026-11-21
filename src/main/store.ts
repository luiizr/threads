import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { p } from './paths'
import {
  Account,
  DEFAULT_SETTINGS,
  FollowerSnapshot,
  LogEntry,
  Post,
  Settings
} from '../shared/types'

interface DB {
  accounts: Account[]
  posts: Post[]
  settings: Settings
  followers: FollowerSnapshot[]
  seq: number
}

const MAX_LOGS = 5000

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    // arquivo corrompido: tenta o backup automático
    try {
      if (existsSync(file + '.bak')) return JSON.parse(readFileSync(file + '.bak', 'utf8')) as T
    } catch {
      /* ignora */
    }
    return fallback
  }
}

function writeAtomic(file: string, data: unknown): void {
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(data))
  if (existsSync(file)) {
    try {
      renameSync(file, file + '.bak')
    } catch {
      /* ignora */
    }
  }
  renameSync(tmp, file)
}

class Store extends EventEmitter {
  db!: DB
  logs: LogEntry[] = []
  private dbTimer: NodeJS.Timeout | null = null
  private logTimer: NodeJS.Timeout | null = null

  load(): void {
    const raw = readJson<Partial<DB>>(p.db(), {})
    this.db = {
      accounts: raw.accounts ?? [],
      posts: raw.posts ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
      followers: raw.followers ?? [],
      seq: raw.seq ?? 1000
    }
    this.logs = readJson<LogEntry[]>(p.logs(), [])
  }

  replaceAll(db: Partial<DB>, logs?: LogEntry[]): void {
    this.db = {
      accounts: db.accounts ?? [],
      posts: db.posts ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(db.settings ?? {}) },
      followers: db.followers ?? [],
      seq: db.seq ?? 1000
    }
    if (logs) this.logs = logs
    this.changed()
    this.logsChanged()
  }

  changed(): void {
    this.emit('changed')
    if (this.dbTimer) return
    this.dbTimer = setTimeout(() => {
      this.dbTimer = null
      this.flushDb()
    }, 300)
  }

  flushDb(): void {
    try {
      writeAtomic(p.db(), this.db)
    } catch (e) {
      console.error('Falha ao salvar banco', e)
    }
  }

  private logsChanged(): void {
    if (this.logTimer) return
    this.logTimer = setTimeout(() => {
      this.logTimer = null
      this.flushLogs()
    }, 800)
  }

  flushLogs(): void {
    try {
      writeAtomic(p.logs(), this.logs)
    } catch (e) {
      console.error('Falha ao salvar logs', e)
    }
  }

  flushAll(): void {
    if (this.dbTimer) clearTimeout(this.dbTimer)
    if (this.logTimer) clearTimeout(this.logTimer)
    this.dbTimer = this.logTimer = null
    this.flushDb()
    this.flushLogs()
  }

  // ---------- contas ----------
  account(id: string): Account | undefined {
    return this.db.accounts.find((a) => a.id === id)
  }

  updateAccount(id: string, patch: Partial<Account>): Account | undefined {
    const a = this.account(id)
    if (!a) return
    Object.assign(a, patch)
    this.changed()
    return a
  }

  // ---------- posts ----------
  post(id: string): Post | undefined {
    return this.db.posts.find((x) => x.id === id)
  }

  nextCode(): string {
    this.db.seq += 1
    return `TF-${this.db.seq}`
  }

  updatePost(id: string, patch: Partial<Post>): Post | undefined {
    const post = this.post(id)
    if (!post) return
    Object.assign(post, patch, { updatedAt: Date.now() })
    this.changed()
    return post
  }

  // ---------- logs ----------
  addLog(entry: Omit<LogEntry, 'id' | 'ts'>): LogEntry {
    const full: LogEntry = { id: 'LOG-' + randomUUID().slice(0, 6).toUpperCase(), ts: Date.now(), ...entry }
    this.logs.unshift(full)
    if (this.logs.length > MAX_LOGS) this.logs.length = MAX_LOGS
    this.emit('log', full)
    this.logsChanged()
    return full
  }

  clearLogs(olderThanDays: number): number {
    const limit = Date.now() - olderThanDays * 86400000
    const before = this.logs.length
    this.logs = this.logs.filter((l) => l.ts >= limit)
    this.logsChanged()
    this.emit('logs-reset')
    return before - this.logs.length
  }
}

export const store = new Store()
