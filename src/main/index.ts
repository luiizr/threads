import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  powerSaveBlocker,
  protocol,
  shell,
  Tray
} from 'electron'
import { join, resolve } from 'path'
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { store } from './store'
import { dataDir, p } from './paths'
import { log, setNotificationHandler } from './log'
import { effectiveConcurrency, findBrowser, shutdownBrowsers } from './browser'
import * as actions from './actions'
import { activeJobs, collectMetrics, lastCheckAt, lastMetricsAt, publishNow, startScheduler, stopScheduler, verifyAccount } from './scheduler'
import { AppState, PickedFile, Settings } from '../shared/types'

if (process.env['TF_USER_DATA']) app.setPath('userData', process.env['TF_USER_DATA'])

protocol.registerSchemesAsPrivileged([
  { scheme: 'tfmedia', privileges: { standard: false, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
])

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let trayHintShown = false

const iconPath = (): string => {
  const candidates = [join(__dirname, '../../resources/icon.png'), join(process.resourcesPath || '', 'app.asar.unpacked/resources/icon.png')]
  return candidates.find((c) => existsSync(c)) ?? candidates[0]
}

// ---------- instância única ----------
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
}

function showWindow(page?: string): void {
  if (!win) createWindow(false)
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (page) win.webContents.send('navigate', page)
}

function createWindow(hidden: boolean): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0B0F17',
    title: 'ThreadFlow',
    icon: iconPath(),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0B0F17', symbolColor: '#94A3B8', height: 40 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.once('ready-to-show', () => {
    if (!hidden) win?.show()
  })
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win?.hide()
    if (!trayHintShown && tray) {
      trayHintShown = true
      tray.displayBalloon?.({
        title: 'ThreadFlow continua rodando',
        content: 'As publicações agendadas serão enviadas normalmente. Clique no ícone perto do relógio para abrir.',
        iconType: 'info'
      })
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(www\.)?threads\.(com|net)\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function buildTray(): void {
  const img = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 })
  tray = new Tray(img)
  tray.setToolTip('ThreadFlow — agendador do Threads')
  const refresh = () => {
    const scheduled = store.db.posts.filter((x) => x.status === 'scheduled').length
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: `ThreadFlow — ${scheduled} agendada(s)`, enabled: false },
        { type: 'separator' },
        { label: 'Abrir', click: () => showWindow() },
        { label: 'Nova publicação', click: () => showWindow('compose') },
        { type: 'separator' },
        {
          label: 'Sair (para de publicar)',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
    )
  }
  refresh()
  store.on('changed', throttle(refresh, 2000))
  tray.on('click', () => showWindow())
}

function throttle(fn: () => void, ms: number): () => void {
  let t: NodeJS.Timeout | null = null
  return () => {
    if (t) return
    t = setTimeout(() => {
      t = null
      fn()
    }, ms)
  }
}

// ---------- estado para a interface ----------
let browserInfo = findBrowser()
function snapshot(): AppState {
  return {
    accounts: store.db.accounts,
    posts: store.db.posts,
    settings: store.db.settings,
    followers: store.db.followers,
    runtime: {
      browserFound: !!browserInfo,
      browserName: browserInfo?.name,
      activeJobs: activeJobs(),
      concurrency: effectiveConcurrency(),
      connecting: actions.isConnecting(),
      lastMetricsAt: lastMetricsAt || undefined,
      lastCheckAt: lastCheckAt || undefined,
      version: app.getVersion(),
      dataDir: dataDir()
    }
  }
}

const pushState = throttle(() => win?.webContents.send('state', snapshot()), 150)

// ---------- energia: não deixa o PC suspender com posts próximos ----------
let blockerId: number | null = null
function updatePowerBlocker(): void {
  const soon = Date.now() + 2 * 3600000
  const need =
    store.db.settings.preventSleep &&
    store.db.posts.some((x) => (x.status === 'scheduled' && (x.scheduledAt ?? 0) < soon) || x.status === 'publishing')
  if (need && blockerId === null) blockerId = powerSaveBlocker.start('prevent-app-suspension')
  if (!need && blockerId !== null) {
    powerSaveBlocker.stop(blockerId)
    blockerId = null
  }
}

function applyAutostart(): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: store.db.settings.autostart, args: ['--hidden'] })
}

// ---------- API chamada pela interface ----------
const api: Record<string, (...args: any[]) => unknown> = {
  getState: () => snapshot(),
  getLogs: () => store.logs,

  connectAccount: () => actions.connectAccount(),
  reconnectAccount: (id: string) => actions.connectAccount(id),
  cancelConnect: () => actions.cancelConnect(),
  verifyAccount: (id: string) => verifyAccount(id),
  verifyAll: async () => {
    await Promise.all(store.db.accounts.map((a) => verifyAccount(a.id, true)))
    log.info('Conta', `Verificação manual concluída (${store.db.accounts.length} conta(s)).`)
  },
  updateAccount: (id: string, patch: { handle?: string; name?: string; paused?: boolean }) => actions.updateAccountInfo(id, patch),
  removeAccount: (id: string, deletePosts: boolean) => actions.removeAccount(id, deletePosts),
  refreshMetrics: (accountId?: string) => collectMetrics(accountId),

  createPosts: (input) => actions.createPosts(input),
  updatePost: (id: string, patch) => actions.updatePost(id, patch),
  deletePost: (id: string) => actions.deletePost(id),
  duplicatePost: (id: string) => actions.duplicatePost(id),
  cancelPost: (id: string) => actions.cancelPost(id),
  retryPost: (id: string) => actions.retryPost(id),
  publishNow: (id: string) => publishNow(id),

  pickMedia: async (): Promise<PickedFile[]> => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Escolher imagens ou vídeos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imagens e vídeos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov'] }]
    })
    if (r.canceled) return []
    return r.filePaths
      .map((f) => ({ path: f, name: f.split(/[\\/]/).pop()!, size: statSync(f).size, type: actions.mediaType(f) }))
      .filter((x): x is PickedFile => !!x.type)
  },

  updateSettings: (patch: Partial<Settings>) => {
    Object.assign(store.db.settings, patch)
    store.changed()
    if ('autostart' in patch) applyAutostart()
    updatePowerBlocker()
  },

  clearLogs: (days: number) => {
    const n = store.clearLogs(days)
    log.info('Sistema', `${n} registro(s) de log antigos removidos.`)
    return n
  },
  exportLogs: async (format: 'json' | 'csv') => {
    const r = await dialog.showSaveDialog(win!, {
      title: 'Exportar logs',
      defaultPath: `threadflow-logs-${new Date().toISOString().slice(0, 10)}.${format}`
    })
    if (r.canceled || !r.filePath) return false
    if (format === 'json') writeFileSync(r.filePath, JSON.stringify(store.logs, null, 2))
    else {
      const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`
      const rows = store.logs.map((l) =>
        [new Date(l.ts).toISOString(), l.level, l.category, store.account(l.accountId || '')?.handle ?? '', l.message].map(q).join(';')
      )
      writeFileSync(r.filePath, '﻿data;nivel;tipo;conta;mensagem\n' + rows.join('\n'))
    }
    return true
  },
  exportBackup: async () => {
    const r = await dialog.showSaveDialog(win!, {
      title: 'Criar backup',
      defaultPath: `threadflow-backup-${new Date().toISOString().slice(0, 10)}.json`
    })
    if (r.canceled || !r.filePath) return false
    store.flushAll()
    writeFileSync(r.filePath, JSON.stringify({ kind: 'threadflow-backup', version: 1, db: store.db, logs: store.logs }))
    log.info('Sistema', 'Backup criado.', { details: r.filePath })
    return true
  },
  restoreBackup: async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Restaurar backup', filters: [{ name: 'Backup', extensions: ['json'] }] })
    if (r.canceled || !r.filePaths[0]) return false
    const data = JSON.parse(readFileSync(r.filePaths[0], 'utf8'))
    if (data.kind !== 'threadflow-backup') throw new Error('Este arquivo não é um backup do ThreadFlow.')
    store.replaceAll(data.db, data.logs)
    log.info('Sistema', 'Backup restaurado. Contas sem sessão neste PC precisarão ser reconectadas.')
    for (const a of store.db.accounts) if (!existsSync(p.session(a.id))) store.updateAccount(a.id, { status: 'expired', lastError: 'Sessão não existe neste computador.' })
    return true
  },
  openDataFolder: () => shell.openPath(dataDir()),
  openPath: (path: string) => {
    if (resolve(path).startsWith(resolve(dataDir()))) return shell.openPath(path)
  },
  openExternal: (url: string) => {
    if (/^https:\/\/(www\.)?threads\.(com|net)\//.test(url)) return shell.openExternal(url)
  },
  redetectBrowser: () => {
    browserInfo = findBrowser()
    pushState()
    return !!browserInfo
  }
}

ipcMain.handle('api', async (_e, method: string, ...args: unknown[]) => {
  const fn = api[method]
  if (!fn) throw new Error(`Método desconhecido: ${method}`)
  try {
    return { ok: true, value: await fn(...args) }
  } catch (e) {
    return { ok: false, error: (e as Error).message || String(e) }
  }
})

// ---------- ciclo de vida ----------
app.whenReady().then(() => {
  app.setAppUserModelId('com.threadflow.desktop')
  store.load()

  protocol.handle('tfmedia', (req) => {
    const u = new URL(req.url)
    const file = decodeURIComponent(u.searchParams.get('p') || '')
    if (!file || !/\.(png|jpe?g|webp|gif|mp4|mov)$/i.test(file) || !existsSync(file)) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })

  store.on('changed', pushState)
  store.on('runtime', pushState)
  store.on('changed', throttle(updatePowerBlocker, 5000))
  store.on('log', (entry) => win?.webContents.send('log', entry))
  store.on('logs-reset', () => win?.webContents.send('logs-reset'))
  setNotificationHandler((target) => showWindow(target))

  const hidden = process.argv.includes('--hidden')
  createWindow(hidden)
  buildTray()
  applyAutostart()
  updatePowerBlocker()

  if (!browserInfo) log.error('Sistema', 'Microsoft Edge ou Google Chrome não encontrado. O ThreadFlow precisa de um deles para publicar.')
  log.info('Sistema', `ThreadFlow ${app.getVersion()} iniciado${hidden ? ' em segundo plano' : ''}. ${store.db.accounts.length} conta(s), ${store.db.posts.filter((x) => x.status === 'scheduled').length} agendada(s).`)
  startScheduler()
})

app.on('window-all-closed', () => {
  /* continua rodando na bandeja */
})

app.on('before-quit', () => {
  quitting = true
  stopScheduler()
  store.flushAll()
})

app.on('will-quit', () => {
  void shutdownBrowsers()
})
