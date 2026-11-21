import { chromium, Browser, BrowserContext } from 'playwright-core'
import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { totalmem } from 'os'
import { p } from './paths'
import { store } from './store'

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

// ---------- localizar navegador ----------
const CANDIDATES: { channel: 'msedge' | 'chrome'; name: string; paths: string[] }[] = [
  {
    channel: 'msedge',
    name: 'Microsoft Edge',
    paths: [
      join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
      join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
      join(process.env['LOCALAPPDATA'] || '', 'Microsoft\\Edge\\Application\\msedge.exe')
    ]
  },
  {
    channel: 'chrome',
    name: 'Google Chrome',
    paths: [
      join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
      join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
      join(process.env['LOCALAPPDATA'] || '', 'Google\\Chrome\\Application\\chrome.exe')
    ]
  }
]

export function findBrowser(): { name: string; executablePath: string } | null {
  for (const c of CANDIDATES) {
    for (const path of c.paths) if (path && existsSync(path)) return { name: c.name, executablePath: path }
  }
  return null
}

async function launch(headless: boolean): Promise<Browser> {
  const found = findBrowser()
  if (!found) {
    throw new Error('Nenhum navegador compatível encontrado. Instale o Microsoft Edge ou o Google Chrome.')
  }
  return chromium.launch({
    executablePath: found.executablePath,
    headless,
    // várias contas em paralelo: nenhuma aba/janela pode ser "congelada" por estar em segundo plano
    args: [
      '--mute-audio',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  })
}

/** número de contas em paralelo: configurado ou automático pela memória do PC */
export function effectiveConcurrency(): number {
  const set = store.db.settings.maxConcurrent
  if (set > 0) return set
  const gb = totalmem() / 1024 ** 3
  // ~250 MB por conta publicando + folga para o Windows e o próprio app
  return Math.max(2, Math.min(10, Math.floor((gb - 3) / 1.2)))
}

// ---------- sessões (criptografadas com DPAPI do Windows) ----------
export function saveSession(accountId: string, state: StorageState): void {
  const json = JSON.stringify(state)
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8')
  writeFileSync(p.session(accountId), data)
}

export function loadSession(accountId: string): StorageState | undefined {
  const file = p.session(accountId)
  if (!existsSync(file)) return undefined
  const buf = readFileSync(file)
  try {
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')
    return JSON.parse(json)
  } catch {
    try {
      return JSON.parse(buf.toString('utf8'))
    } catch {
      return undefined
    }
  }
}

export function deleteSession(accountId: string): void {
  try {
    unlinkSync(p.session(accountId))
  } catch {
    /* ignora */
  }
}

// ---------- navegador compartilhado (um processo, vários contextos isolados) ----------
const shared: { browser: Browser | null; headless: boolean; launching: Promise<Browser> | null; users: number } = {
  browser: null,
  headless: true,
  launching: null,
  users: 0
}
let idleTimer: NodeJS.Timeout | null = null

async function getShared(): Promise<Browser> {
  const headless = !store.db.settings.showBrowser
  if (shared.browser && shared.browser.isConnected() && shared.headless === headless) return shared.browser
  if (shared.browser && shared.users === 0) {
    await shared.browser.close().catch(() => {})
    shared.browser = null
  }
  if (shared.browser && shared.browser.isConnected()) return shared.browser // em uso no outro modo; reaproveita
  if (!shared.launching) {
    shared.launching = launch(headless)
      .then((b) => {
        shared.browser = b
        shared.headless = headless
        b.on('disconnected', () => {
          if (shared.browser === b) shared.browser = null
        })
        return b
      })
      .finally(() => {
        shared.launching = null
      })
  }
  return shared.launching
}

export interface AccountContext {
  context: BrowserContext
  close: (save?: boolean) => Promise<void>
}

export async function openAccountContext(accountId: string): Promise<AccountContext> {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  shared.users++
  try {
    const browser = await getShared()
    const context = await browser.newContext({
      storageState: loadSession(accountId),
      locale: 'pt-BR',
      viewport: { width: 1280, height: 900 }
    })
    context.setDefaultTimeout(30000)
    if (store.db.settings.lightMode) {
      // modo leve: não baixa fotos/vídeos/fontes do feed (não afeta o upload das suas mídias)
      await context.route('**/*', (route) => {
        const t = route.request().resourceType()
        return t === 'image' || t === 'media' || t === 'font' ? route.abort() : route.continue()
      })
    }
    let closed = false
    return {
      context,
      close: async (save = true) => {
        if (closed) return
        closed = true
        try {
          if (save) saveSession(accountId, await context.storageState())
        } catch {
          /* ignora */
        }
        await context.close().catch(() => {})
        release()
      }
    }
  } catch (e) {
    release()
    throw e
  }
}

function release(): void {
  shared.users = Math.max(0, shared.users - 1)
  if (shared.users === 0) {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (shared.users === 0 && shared.browser) {
        shared.browser.close().catch(() => {})
        shared.browser = null
      }
    }, 3 * 60 * 1000)
  }
}

// navegador visível só para o login
export async function launchVisible(): Promise<Browser> {
  return launch(false)
}

/** abre o navegador antes da hora, para o lançamento (~1-2 s) não atrasar a publicação */
export async function warmUp(): Promise<void> {
  if (shared.browser?.isConnected()) return
  shared.users++
  try {
    await getShared()
  } catch {
    /* o erro aparece na publicação */
  } finally {
    release()
  }
}

export async function shutdownBrowsers(): Promise<void> {
  if (shared.browser) await shared.browser.close().catch(() => {})
  shared.browser = null
}
