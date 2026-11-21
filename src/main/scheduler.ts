import { store } from './store'
import { log, notify } from './log'
import { AccountContext, effectiveConcurrency, openAccountContext, warmUp } from './browser'
import { findPostUrl, preparePost, readPostMetrics, SessionExpiredError, StepError, verifySession } from './threads'
import { Account, Post } from '../shared/types'

/*
 * Como a fila funciona:
 * - Cada conta tem no máximo UMA tarefa por vez (publicar, verificar ou ler métricas).
 * - Contas diferentes rodam em paralelo, até o limite de "vagas" (effectiveConcurrency).
 * - Para publicar, cada conta tem um "trabalhador" que abre a sessão uma vez e publica
 *   em sequência todos os posts vencidos dela, sem fechar e reabrir o navegador.
 * - O editor é preparado antes do horário; no horário exato só falta o clique.
 */

const BACKOFF_MIN = [1, 5, 15, 30, 60]
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------- vagas globais ----------
let active = 0
const waiters: (() => void)[] = []
async function acquire(): Promise<void> {
  if (active < effectiveConcurrency()) {
    active++
    emitRuntime()
    return
  }
  await new Promise<void>((r) => waiters.push(r))
  active++
  emitRuntime()
}
function releaseSlot(): void {
  active--
  emitRuntime()
  if (waiters.length && active < effectiveConcurrency()) waiters.shift()!()
}
export function activeJobs(): number {
  return active
}
function emitRuntime(): void {
  store.emit('runtime')
}

// ---------- uma tarefa por conta de cada vez ----------
const accountChains = new Map<string, Promise<unknown>>()
function onAccount<T>(accountId: string, job: () => Promise<T>, priority = false): Promise<T> {
  const prev = accountChains.get(accountId) ?? Promise.resolve()
  const next = prev.catch(() => {}).then(async () => {
    // publicação tem prioridade: entra na frente das tarefas de fundo que esperam vaga
    if (priority && active >= effectiveConcurrency()) {
      await new Promise<void>((r) => waiters.unshift(r))
      active++
      emitRuntime()
    } else await acquire()
    try {
      return await job()
    } finally {
      releaseSlot()
    }
  })
  accountChains.set(accountId, next)
  next
    .finally(() => {
      if (accountChains.get(accountId) === next) accountChains.delete(accountId)
    })
    .catch(() => {})
  return next
}

// ---------- publicação ----------
const inFlight = new Set<string>()
const cancelRequested = new Set<string>()
const workers = new Set<string>() // contas com trabalhador de publicação ativo

export function requestCancel(postId: string): boolean {
  if (!inFlight.has(postId)) return false
  cancelRequested.add(postId)
  return true
}

function markExpired(account: Account, reason: string): void {
  if (store.account(account.id)?.status === 'expired') return
  store.updateAccount(account.id, { status: 'expired', lastError: reason, lastCheckedAt: Date.now() })
  const pending = store.db.posts.filter((x) => x.accountId === account.id && x.status === 'scheduled').length
  log.error('Conta', `Sessão de @${account.handle} expirou. ${pending} publicação(ões) aguardando reconexão.`, {
    accountId: account.id,
    details: reason
  })
  notify('disconnected', `@${account.handle} desconectada`, 'Reconecte a conta para continuar publicando.', 'accounts')
}

function dueAt(post: Post): number {
  return post.nextAttemptAt ?? post.scheduledAt ?? Date.now()
}

/**
 * Quanto antes começar a preparar. Medido: 1 conta abre o editor em ~3-4 s, mas 8 contas
 * ao mesmo tempo levam ~12-18 s (disputam o processador). Então, quanto mais contas no
 * mesmo horário, mais cedo começa. (Contas além do número de vagas só preparam quando
 * uma vaga libera, ou seja, logo depois que a primeira leva publica.)
 */
function leadMs(post: Post): number {
  const videos = post.media.filter((m) => m.type === 'video').length
  const t = dueAt(post)
  const sameSlot = store.db.posts.filter((x) => x.status === 'scheduled' && Math.abs(dueAt(x) - t) < 60000).length
  const extra = Math.min(Math.max(0, sameSlot - 1), effectiveConcurrency()) * 3000
  return Math.max(15, store.db.settings.prepareSeconds) * 1000 + videos * 60000 + extra
}

/** próximo post desta conta que já deve começar a ser preparado */
function nextDuePost(accountId: string): Post | undefined {
  const now = Date.now()
  return store.db.posts
    .filter((x) => x.accountId === accountId && x.status === 'scheduled' && x.scheduledAt != null && !inFlight.has(x.id) && dueAt(x) - leadMs(x) <= now)
    .sort((a, b) => dueAt(a) - dueAt(b))[0]
}

function accountReady(account?: Account): account is Account {
  return !!account && !account.paused && account.status !== 'expired'
}

function startWorker(accountId: string): void {
  if (workers.has(accountId)) return
  workers.add(accountId)
  onAccount(
    accountId,
    async () => {
      let ctx: AccountContext | null = null
      let lastCommitAt = 0
      let count = 0
      try {
        for (;;) {
          const account = store.account(accountId)
          if (!accountReady(account)) break
          const post = nextDuePost(accountId)
          if (!post) break
          if (!ctx) ctx = await openAccountContext(accountId)
          const ok = await publishOne(ctx, account, post, lastCommitAt)
          if (ok) {
            lastCommitAt = Date.now()
            count++
          }
          if (store.account(accountId)?.status === 'expired') break
        }
      } finally {
        if (ctx) await ctx.close(true)
      }
      return count
    },
    true
  )
    .catch((e) => log.error('Fila', `Erro inesperado na fila: ${(e as Error).message}`, { accountId, details: (e as Error).stack }))
    .finally(() => workers.delete(accountId))
}

const fmtTimings = (t: Record<string, number>) =>
  Object.entries(t)
    .map(([k, v]) => `${k}: ${(v / 1000).toFixed(1)} s`)
    .join(' · ')

/** prepara, espera o horário e publica um post. Devolve true se publicou. */
async function publishOne(ctx: AccountContext, account: Account, post0: Post, lastCommitAt: number): Promise<boolean> {
  const postId = post0.id
  inFlight.add(postId)
  if (post0.nextAttemptAt) store.updatePost(postId, { scheduledAt: Math.max(post0.scheduledAt ?? 0, post0.nextAttemptAt), nextAttemptAt: undefined })
  store.updatePost(postId, { status: 'publishing', progress: 'Preparando', error: undefined })
  const startedAt = Date.now()
  let page: import('playwright-core').Page | null = null
  try {
    if (cancelRequested.has(postId)) throw new Error('__cancel__')
    const post = store.post(postId)!
    const prepared = await preparePost(ctx.context, {
      handle: account.handle,
      text: post.text,
      files: post.media.map((m) => m.path),
      videos: post.media.filter((m) => m.type === 'video').length,
      onProgress: (msg) => store.updatePost(postId, { progress: msg })
    })
    page = prepared.page
    const prepMs = Date.now() - startedAt

    // espera o horário (e o intervalo mínimo entre posts da mesma conta)
    const gap = Math.max(0, store.db.settings.sameAccountGapSec) * 1000
    const target = Math.max(store.post(postId)?.scheduledAt ?? Date.now(), lastCommitAt ? lastCommitAt + gap : 0)
    while (Date.now() < target) {
      if (cancelRequested.has(postId)) throw new Error('__cancel__')
      store.updatePost(postId, { progress: `Pronto, publica em ${Math.ceil((target - Date.now()) / 1000)}s` })
      await wait(Math.min(1000, target - Date.now()))
    }
    if (cancelRequested.has(postId)) throw new Error('__cancel__')

    const { url, timings } = await prepared.commit()
    const publishedAt = Date.now()
    const late = Math.max(0, publishedAt - (post.scheduledAt ?? publishedAt))
    store.updatePost(postId, { status: 'published', publishedAt, url, progress: undefined, error: undefined, nextAttemptAt: undefined })
    if (account.status !== 'connected') store.updateAccount(account.id, { status: 'connected', lastError: undefined })
    const all = { ...prepared.timings, ...timings }
    const entry = log.info(
      'Publicação',
      `Publicado em @${account.handle} (${post.code}). Preparo ${(prepMs / 1000).toFixed(1)} s, publicação ${(((timings['clique'] ?? 0) + (timings['confirmação'] ?? 0) + (timings['aviso final'] ?? 0)) / 1000).toFixed(1)} s${late > 5000 ? `, ${Math.round(late / 1000)} s após o horário` : ''}.`,
      {
        accountId: account.id,
        postId,
        details: `Tempo por etapa: ${fmtTimings(all)}`,
        data: { url: url ?? null, timingsMs: all, prepareMs: prepMs, lateMs: late }
      }
    )
    store.updatePost(postId, { lastLogId: entry.id })
    notify('success', `Publicado em @${account.handle}`, post.text.slice(0, 80) || 'Publicação com mídia', 'posts')
    if (!url) scheduleUrlLookup(postId)
    return true
  } catch (e) {
    handleFailure(postId, account, e)
    return false
  } finally {
    if (page) await page.close().catch(() => {})
    inFlight.delete(postId)
    cancelRequested.delete(postId)
  }
}

function handleFailure(postId: string, account: Account, e: unknown): void {
  const post = store.post(postId)
  if (!post) return
  if ((e as Error)?.message === '__cancel__') {
    store.updatePost(postId, { status: 'canceled', progress: undefined })
    log.info('Fila', `Envio de ${post.code} cancelado antes de publicar.`, { accountId: account.id, postId })
    return
  }
  const s = store.db.settings
  if (e instanceof SessionExpiredError) {
    store.updatePost(postId, { status: 'scheduled', progress: undefined, error: e.message })
    markExpired(account, e.message)
    const entry = log.error('Publicação', `Não publicado em @${account.handle}: sessão expirada. A publicação ${post.code} volta para a fila após reconectar.`, {
      accountId: account.id,
      postId
    })
    store.updatePost(postId, { lastLogId: entry.id })
    return
  }
  const se = e instanceof StepError ? e : null
  const message = se?.message || (e as Error)?.message || String(e)
  const attempts = post.attempts + 1
  const retryable = (se ? se.retryable : true) && s.retryTransient
  const canRetry = retryable && attempts <= s.retries
  const details = [
    `Etapa: ${se?.step ?? 'desconhecida'}`,
    `Tentativa: ${attempts}/${s.retries + 1}`,
    se?.timings ? `Tempo por etapa: ${fmtTimings(se.timings)}` : '',
    (e as Error)?.stack ?? ''
  ]
    .filter(Boolean)
    .join('\n')
  if (canRetry) {
    const delay = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)]
    const entry = log.warn('Publicação', `Falha ao publicar ${post.code} em @${account.handle}: ${message} Nova tentativa em ${delay} min.`, {
      accountId: account.id,
      postId,
      details,
      screenshot: se?.screenshot
    })
    store.updatePost(postId, { status: 'scheduled', attempts, nextAttemptAt: Date.now() + delay * 60000, progress: undefined, error: message, lastLogId: entry.id })
  } else {
    const entry = log.error('Publicação', `Falha ao publicar ${post.code} em @${account.handle}: ${message}`, {
      accountId: account.id,
      postId,
      details,
      screenshot: se?.screenshot
    })
    store.updatePost(postId, { status: 'failed', attempts, progress: undefined, error: message, lastLogId: entry.id, nextAttemptAt: undefined })
    notify('failure', `Falha em @${account.handle}`, message, 'logs')
    if (s.pauseAccountOnError) {
      store.updateAccount(account.id, { paused: true })
      log.warn('Fila', `Fila de @${account.handle} pausada após falha (configuração "Pausar fila em caso de erro").`, { accountId: account.id })
    }
  }
}

// ---------- link do post em segundo plano ----------
function scheduleUrlLookup(postId: string): void {
  setTimeout(() => void resolveUrls(store.post(postId)?.accountId), 60000)
}

async function resolveUrls(accountId?: string): Promise<void> {
  if (!accountId) return
  const account = store.account(accountId)
  if (!account || account.status !== 'connected') return
  const missing = store.db.posts.filter((x) => x.accountId === accountId && x.status === 'published' && !x.url && (x.publishedAt ?? 0) > Date.now() - 3 * 86400000)
  if (!missing.length) return
  await onAccount(accountId, async () => {
    const ctx = await openAccountContext(accountId)
    const page = await ctx.context.newPage()
    try {
      for (const post of missing) {
        const url = await findPostUrl(page, account.handle, post.text)
        if (url) store.updatePost(post.id, { url })
      }
    } finally {
      await page.close().catch(() => {})
      await ctx.close(true)
    }
  }).catch(() => {})
}

// ---------- verificação de contas ----------
export function verifyAccount(accountId: string, quiet = false): Promise<boolean> {
  const account = store.account(accountId)
  if (!account) return Promise.resolve(false)
  const prevStatus = account.status
  const wasExpired = prevStatus === 'expired'
  // conta desconectada continua "desconectada" durante a checagem, para a fila não andar
  if (!wasExpired) store.updateAccount(accountId, { status: 'checking' })
  return onAccount(accountId, async () => {
    const ctx = await openAccountContext(accountId)
    let ok = false
    try {
      const prof = await verifySession(ctx.context, account.handle)
      if (prof) {
        ok = true
        const patch: Partial<Account> = { status: 'connected', lastCheckedAt: Date.now(), lastError: undefined }
        if (prof.name) patch.name = prof.name
        if (prof.followers !== undefined) {
          patch.followers = prof.followers
          store.db.followers.push({ accountId, ts: Date.now(), followers: prof.followers })
          trimFollowers()
        }
        store.updateAccount(accountId, patch)
        if (!quiet) log.info('Conta', `Sessão de @${account.handle} verificada: ativa.`, { accountId })
      } else if (wasExpired) {
        store.updateAccount(accountId, { lastCheckedAt: Date.now() })
      } else {
        markExpired(store.account(accountId)!, 'O Threads pediu login novamente.')
      }
    } finally {
      await ctx.close(ok)
    }
    return ok
  }).catch((e) => {
    store.updateAccount(accountId, {
      status: prevStatus === 'expired' ? 'expired' : 'error',
      lastCheckedAt: Date.now(),
      lastError: (e as Error).message
    })
    log.warn('Conta', `Não foi possível verificar @${account.handle}: ${(e as Error).message}`, { accountId })
    return false
  })
}

function trimFollowers(): void {
  const limit = Date.now() - 400 * 86400000
  if (store.db.followers.length > 20000 || store.db.followers[0]?.ts < limit) {
    store.db.followers = store.db.followers.filter((f) => f.ts >= limit).slice(-20000)
  }
}

/** conta com post nos próximos minutos: não gasta a vaga dela com tarefas de fundo */
function busySoon(accountId: string, minutes = 10): boolean {
  const limit = Date.now() + minutes * 60000
  return workers.has(accountId) || store.db.posts.some((x) => x.accountId === accountId && x.status === 'scheduled' && dueAt(x) < limit)
}

// ---------- métricas ----------
let metricsRunning = false
export async function collectMetrics(onlyAccountId?: string): Promise<void> {
  if (metricsRunning) return
  metricsRunning = true
  try {
    const accounts = store.db.accounts.filter((a) => a.status === 'connected' && (!onlyAccountId || a.id === onlyAccountId) && (onlyAccountId || !busySoon(a.id)))
    await Promise.all(
      accounts.map(async (account) => {
        await resolveUrls(account.id)
        const posts = store.db.posts
          .filter((x) => x.accountId === account.id && x.status === 'published' && x.url && (x.publishedAt ?? 0) > Date.now() - 30 * 86400000)
          .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
          .slice(0, 25)
        await onAccount(account.id, async () => {
          const ctx = await openAccountContext(account.id)
          const page = await ctx.context.newPage()
          let updated = 0
          try {
            // perfil: seguidores + confirma a sessão na mesma visita
            const prof = await verifySession(ctx.context, account.handle).catch(() => undefined)
            if (prof === null) {
              markExpired(account, 'O Threads pediu login novamente.')
              return
            }
            if (prof?.followers !== undefined) {
              store.updateAccount(account.id, { followers: prof.followers, lastCheckedAt: Date.now(), status: 'connected' })
              store.db.followers.push({ accountId: account.id, ts: Date.now(), followers: prof.followers })
              trimFollowers()
            }
            for (const post of posts) {
              const m = await readPostMetrics(page, post.url!).catch(() => null)
              if (m) {
                store.updatePost(post.id, { metrics: m, metricsUpdatedAt: Date.now() })
                updated++
              }
            }
          } finally {
            await page.close().catch(() => {})
            await ctx.close(true)
          }
          log.info('Métricas', `Métricas atualizadas para @${account.handle}: ${updated}/${posts.length} publicações.`, { accountId: account.id })
        }).catch((e) => log.warn('Métricas', `Falha ao coletar métricas de @${account.handle}: ${(e as Error).message}`, { accountId: account.id }))
      })
    )
    lastMetricsAt = Date.now()
    emitRuntime()
  } finally {
    metricsRunning = false
  }
}

// ---------- laço principal ----------
let timer: NodeJS.Timeout | null = null
export let lastMetricsAt = 0 // última coleta real
export let lastCheckAt = 0 // última verificação real
let nextCheckAt = 0
let nextMetricsAt = 0

export function isInFlight(postId: string): boolean {
  return inFlight.has(postId)
}

export function publishNow(postId: string): void {
  const post = store.post(postId)
  if (!post || inFlight.has(postId)) return
  store.updatePost(postId, { status: 'scheduled', scheduledAt: Date.now(), nextAttemptAt: undefined })
  tick()
}

function tick(): void {
  const now = Date.now()
  let warm = false
  for (const post of store.db.posts) {
    if (post.status !== 'scheduled' || post.scheduledAt == null || inFlight.has(post.id)) continue
    const account = store.account(post.accountId)
    if (!accountReady(account) || (account.status === 'checking' && post.error)) continue
    const start = dueAt(post) - leadMs(post)
    if (start <= now) startWorker(account.id)
    else if (start - now < 30000) warm = true
  }
  if (warm) void warmUp()

  const s = store.db.settings
  if (s.checkIntervalMin > 0 && now >= Math.min(nextCheckAt, (lastCheckAt || now) + s.checkIntervalMin * 60000)) {
    lastCheckAt = now
    nextCheckAt = now + s.checkIntervalMin * 60000
    for (const a of store.db.accounts) {
      if (a.status !== 'checking' && a.status !== 'expired' && !accountChains.has(a.id) && !busySoon(a.id)) void verifyAccount(a.id, true)
    }
    emitRuntime()
  }
  if (s.metricsIntervalMin > 0 && now >= Math.min(nextMetricsAt, (lastMetricsAt || now) + s.metricsIntervalMin * 60000)) {
    nextMetricsAt = now + s.metricsIntervalMin * 60000
    void collectMetrics()
  }
}

export function startScheduler(): void {
  const now = Date.now()
  // publicações interrompidas (app fechado no meio do envio)
  for (const post of store.db.posts) {
    if (post.status === 'publishing') {
      store.updatePost(post.id, {
        status: 'failed',
        progress: undefined,
        error: 'O app foi fechado durante o envio. Confira no perfil se foi publicado antes de tentar de novo.'
      })
      log.warn('Fila', `Envio de ${post.code} interrompido pelo fechamento do app.`, { postId: post.id, accountId: post.accountId })
    }
  }
  // horários perdidos com o computador desligado
  if (store.db.settings.missedPolicy === 'skip') {
    for (const post of store.db.posts) {
      if (post.status === 'scheduled' && post.scheduledAt && post.scheduledAt < now - 5 * 60000 && !post.nextAttemptAt) {
        store.updatePost(post.id, { status: 'failed', error: 'Horário perdido: o computador estava desligado ou o app fechado.' })
        log.warn('Fila', `Publicação ${post.code} não enviada: horário perdido enquanto o app estava fechado.`, { postId: post.id, accountId: post.accountId })
      }
    }
  }
  nextCheckAt = now + 20000 // primeira checagem logo após abrir
  nextMetricsAt = now + 5 * 60000
  timer = setInterval(tick, 1000)
  tick()
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}

export function pendingForAccount(accountId: string): Post[] {
  return store.db.posts.filter((x) => x.accountId === accountId && x.status === 'scheduled')
}
