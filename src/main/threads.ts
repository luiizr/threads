import type { BrowserContext, Locator, Page } from 'playwright-core'
import { join } from 'path'
import { S } from './selectors'
import { p } from './paths'
import { launchVisible, saveSession } from './browser'
import { PostMetrics } from '../shared/types'

/*
 * Regras de desempenho deste arquivo:
 * - Nunca usar waitForLoadState('networkidle'): o Threads mantém conexões abertas e isso
 *   custa de 3 a 8 s por navegação. Sempre esperar pelo elemento que interessa.
 * - Navegar com waitUntil 'commit' / 'domcontentloaded' e depois esperar o elemento.
 * - Sem pausas fixas (wait(ms)) no caminho da publicação: só sondagens curtas com condição.
 * - Cada etapa é cronometrada (Timer) e vai para o log, para sabermos onde o tempo é gasto.
 */

export class SessionExpiredError extends Error {
  constructor(msg = 'A sessão desta conta expirou. Reconecte a conta.') {
    super(msg)
    this.name = 'SessionExpiredError'
  }
}

export class StepError extends Error {
  timings?: Record<string, number>
  constructor(
    msg: string,
    public step: string,
    public retryable = true,
    public screenshot?: string
  ) {
    super(msg)
    this.name = 'StepError'
  }
}

/** cronômetro por etapa: { abrir: 1200, texto: 300, ... } em ms */
export class Timer {
  private last = Date.now()
  readonly start = Date.now()
  readonly steps: Record<string, number> = {}
  mark(step: string): void {
    const now = Date.now()
    this.steps[step] = (this.steps[step] ?? 0) + (now - this.last)
    this.last = now
  }
  total(): number {
    return Date.now() - this.start
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const anyOf = (list: string[], exact = true) =>
  new RegExp(exact ? `^\\s*(${list.map(esc).join('|')})\\s*$` : `(${list.map(esc).join('|')})`, 'i')

/** sonda uma condição a cada `every` ms até `timeout`; devolve o valor ou null */
async function poll<T>(fn: () => Promise<T | null | undefined | false>, timeout: number, every = 200): Promise<T | null> {
  const deadline = Date.now() + timeout
  for (;;) {
    const v = await fn().catch(() => null)
    if (v) return v as T
    if (Date.now() >= deadline) return null
    await wait(every)
  }
}

const visible = (l: Locator) => l.first().isVisible().catch(() => false)

export function parseCount(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined
  const s = raw.toLowerCase().replace(/\u00a0/g, ' ')
  const m = s.match(/(\d[\d.,]*)\s*(mil|mi|bi|k|m|b)?\b/)
  if (!m) return undefined
  const suffix = m[2]
  if (suffix) {
    const mult = { mil: 1e3, k: 1e3, mi: 1e6, m: 1e6, bi: 1e9, b: 1e9 }[suffix] ?? 1
    return Math.round(parseFloat(m[1].replace(',', '.')) * mult)
  }
  return parseInt(m[1].replace(/[.,]/g, ''), 10)
}

async function shot(page: Page, tag: string): Promise<string | undefined> {
  try {
    const file = join(p.screenshots(), `${Date.now()}-${tag}.png`)
    await page.screenshot({ path: file, fullPage: false, timeout: 5000 })
    return file
  } catch {
    return undefined
  }
}

async function hasSessionCookie(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies(S().base)
  return cookies.some((c) => c.name === 'sessionid' && !!c.value)
}

/** ícones do Threads usam aria-label ou <title> */
function svgWithLabel(scope: Page | Locator, labels: string[]): Locator {
  const css = labels.map((l) => `svg[aria-label="${l}"]`).join(',')
  return scope.locator(css).or(scope.locator('svg').filter({ has: scope.locator('title').filter({ hasText: anyOf(labels) }) }))
}

function loginHints(page: Page): Locator {
  const sel = S()
  return page
    .getByRole('button', { name: anyOf(sel.loginTexts) })
    .or(page.getByRole('link', { name: anyOf(sel.loginTexts) }))
    .or(page.getByText(anyOf(['Continuar com o Instagram', 'Continue with Instagram'])))
}

/** logado, o ícone "Perfil" do menu é um link para /@usuario (deslogado é só um botão) */
function profileLink(page: Page): Locator {
  return page.locator('a[href^="/@"]').filter({ has: svgWithLabel(page, S().profileLabels) })
}

async function goto(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  } catch {
    throw new StepError('Não foi possível abrir o Threads (sem internet ou site fora do ar).', 'abrir', true)
  }
}

/** espera a página mostrar sinal claro de logado / deslogado */
export async function isLoggedIn(page: Page, timeout = 8000): Promise<boolean> {
  if (!(await hasSessionCookie(page.context()))) return false
  const r = await poll<'in' | 'out'>(async () => {
    if (/\/login/.test(page.url())) return 'out'
    if (await visible(loginHints(page))) return 'out'
    if (await visible(profileLink(page))) return 'in'
    return null
  }, timeout)
  return r !== 'out' // sem sinal claro: confia no cookie de sessão
}

// ---------- perfil ----------
export async function detectOwnHandle(page: Page): Promise<string | null> {
  const labels = S().profileLabels
  return page
    .evaluate((labels) => {
      for (const svg of Array.from(document.querySelectorAll('svg'))) {
        const lab = svg.getAttribute('aria-label') || svg.querySelector('title')?.textContent || ''
        if (!labels.includes(lab.trim())) continue
        const a = svg.closest('a[href^="/@"]')
        if (a) return (a.getAttribute('href') || '').replace(/^\/@/, '').split(/[/?#]/)[0]
      }
      return null
    }, labels)
    .catch(() => null)
}

export interface ProfileInfo {
  name?: string
  avatar?: string
  followers?: number
}

export async function readProfile(page: Page, handle: string, withAvatar = true): Promise<ProfileInfo> {
  await goto(page, `${S().base}/@${handle}`)
  const words = S().followersWords
  // o og:title vem no HTML; o número de seguidores aparece logo após a renderização
  const info = await poll(
    () =>
      page.evaluate((words) => {
        const meta = (k: string) => document.querySelector(`meta[property="${k}"]`)?.getAttribute('content') || ''
        const text = document.body?.innerText || ''
        const m = text.match(new RegExp(`(\\d[\\d.,]*\\s*(?:mil|mi|k|m)?)\\s*(?:${words.join('|')})\\b`, 'i'))
        const title = meta('og:title')
        return m || title ? { title, image: meta('og:image'), followersRaw: m ? m[1] : '' } : null
      }, words),
    8000,
    250
  )
  if (!info) return {}
  // se ainda não tinha seguidores, dá mais um instante só para isso
  if (!info.followersRaw) {
    const again = await poll(
      () =>
        page.evaluate((words) => {
          const m = (document.body?.innerText || '').match(new RegExp(`(\\d[\\d.,]*\\s*(?:mil|mi|k|m)?)\\s*(?:${words.join('|')})\\b`, 'i'))
          return m ? m[1] : null
        }, words),
      3000,
      250
    )
    if (again) info.followersRaw = again
  }
  const name = info.title ? info.title.split(/\s*\(@/)[0].trim() : undefined
  let avatar: string | undefined
  if (withAvatar && info.image) {
    try {
      const res = await page.context().request.get(info.image, { timeout: 15000 })
      if (res.ok()) {
        const type = res.headers()['content-type'] || 'image/jpeg'
        avatar = `data:${type};base64,${(await res.body()).toString('base64')}`
      }
    } catch {
      /* ignora */
    }
  }
  return { name, avatar, followers: parseCount(info.followersRaw) }
}

// ---------- login (janela visível, a pessoa faz o login) ----------
export interface LoginResult {
  handle: string | null
  profile: ProfileInfo
}

export async function interactiveLogin(accountId: string, signal: { cancelled: boolean }): Promise<LoginResult> {
  const browser = await launchVisible()
  try {
    const context = await browser.newContext({ locale: 'pt-BR', viewport: null })
    const page = await context.newPage()
    let closedByUser = false
    page.on('close', () => (closedByUser = true))
    await page.goto(`${S().base}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
    const deadline = Date.now() + 15 * 60 * 1000
    for (;;) {
      if (signal.cancelled || closedByUser || !browser.isConnected()) throw new Error('Login cancelado: a janela foi fechada.')
      if (Date.now() > deadline) throw new Error('Tempo esgotado esperando o login (15 min).')
      const ok = (await hasSessionCookie(context)) && !/\/login|\/accounts\//.test(page.url())
      if (ok) break
      await wait(1000)
    }
    if (!/threads\.(com|net)\/?($|\?)/.test(page.url())) await goto(page, S().base + '/').catch(() => {})
    const handle = await poll(() => detectOwnHandle(page), 10000, 300)
    let profile: ProfileInfo = {}
    if (handle) profile = await readProfile(page, handle).catch(() => ({}))
    saveSession(accountId, await context.storageState())
    return { handle, profile }
  } finally {
    await browser.close().catch(() => {})
  }
}

// ---------- verificação de sessão ----------
export async function verifySession(context: BrowserContext, handle: string): Promise<ProfileInfo | null> {
  const page = await context.newPage()
  try {
    // o próprio perfil já serve de teste: se a sessão caiu, aparece o pedido de login
    if (!(await hasSessionCookie(context))) return null
    const prof = await readProfile(page, handle, false)
    if (!(await isLoggedIn(page, 5000))) return null
    return prof
  } finally {
    await page.close().catch(() => {})
  }
}

// ---------- publicação ----------
function composer(page: Page): Locator {
  return page.locator('div[role="dialog"]').filter({ has: page.locator('[contenteditable="true"]') }).last()
}

function postButton(dlg: Locator): Locator {
  const re = anyOf(S().postButton)
  return dlg
    .getByRole('button', { name: re })
    .or(dlg.locator('[role="button"], button').filter({ hasText: re }))
    .last()
}

async function openComposer(page: Page, text: string, t: Timer): Promise<Locator> {
  const sel = S()
  const dlg = composer(page)
  // 1) link de intenção oficial do Threads: abre o editor já com o texto
  await goto(page, `${sel.base}/intent/post?text=${encodeURIComponent(text)}`)
  const r = await poll<'dlg' | 'login'>(async () => {
    if (/\/login/.test(page.url())) return 'login'
    if (await visible(dlg)) return 'dlg'
    if (await visible(loginHints(page))) return 'login'
    return null
  }, 15000)
  t.mark('abrir editor')
  if (r === 'login') throw new SessionExpiredError()
  if (r === 'dlg') return dlg

  // 2) plano B: botão "Criar" da página inicial
  await goto(page, sel.base + '/')
  if (!(await isLoggedIn(page))) throw new SessionExpiredError()
  const trigger = page
    .getByText(anyOf(sel.composerTrigger), { exact: false })
    .or(page.locator('[role="button"]').filter({ has: svgWithLabel(page, sel.createLabels) }))
  try {
    await trigger.first().click({ timeout: 10000 })
    await dlg.waitFor({ state: 'visible', timeout: 10000 })
    t.mark('abrir editor (plano B)')
    return dlg
  } catch {
    throw new StepError('Não encontrei o editor de nova publicação no Threads.', 'abrir editor', true, await shot(page, 'editor'))
  }
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

async function fillText(page: Page, dlg: Locator, text: string): Promise<void> {
  const editor = dlg.locator('[contenteditable="true"]').first()
  const want = norm(text)
  if (!want) return
  const head = want.slice(0, Math.min(40, want.length))
  // o link de intenção costuma já trazer o texto: confere rápido antes de digitar
  const ready = await poll(async () => norm((await editor.innerText()) || '').includes(head), 1500, 150)
  if (ready) return
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.insertText(lines[i])
    if (i < lines.length - 1) await page.keyboard.press('Shift+Enter')
  }
  const ok = await poll(async () => norm((await editor.innerText()) || '').includes(head.slice(0, 20)), 2000, 150)
  if (!ok) throw new StepError('O texto não foi inserido no editor do Threads.', 'texto', true, await shot(page, 'texto'))
}

const PREVIEWS = 'img[src^="blob:"], img[src^="data:image/"], video'

async function attachMedia(page: Page, dlg: Locator, files: string[], videos: number): Promise<void> {
  if (!files.length) return
  const input = dlg.locator('input[type="file"]').first()
  try {
    if (await input.count()) await input.setInputFiles(files)
    else await page.locator('input[type="file"]').first().setInputFiles(files)
  } catch {
    throw new StepError('Não consegui anexar as mídias no editor do Threads.', 'mídia', true, await shot(page, 'midia'))
  }
  // espera as prévias; se o seletor de prévia não bater, não trava: o botão Postar decide
  await poll(async () => (await dlg.locator(PREVIEWS).count()) >= files.length, 4000 + files.length * 1000 + videos * 30000, 250)
}

/** botão habilitado = pronto para publicar. Falha rápido se o botão nem existir. */
async function waitEnabled(btn: Locator, timeoutMs: number): Promise<void> {
  const found = await poll(async () => (await btn.count()) > 0, 8000, 200)
  if (!found) throw new Error('botão não encontrado')
  const ok = await poll(async () => (await btn.getAttribute('aria-disabled')) !== 'true' && (await btn.isEnabled()), timeoutMs, 200)
  if (!ok) throw new Error('botão desabilitado')
}

export interface PreparedPost {
  commit: () => Promise<{ url?: string; timings: Record<string, number> }>
  page: Page
  timings: Record<string, number>
}

export interface PublishInput {
  handle: string
  text: string
  files: string[]
  videos: number
  onProgress?: (msg: string) => void
}

/** Abre o editor, escreve o texto e anexa as mídias. Deixa tudo pronto para clicar em Postar. */
export async function preparePost(context: BrowserContext, input: PublishInput): Promise<PreparedPost> {
  const t = new Timer()
  if (!(await hasSessionCookie(context))) throw new SessionExpiredError()
  const page = await context.newPage()
  t.mark('nova aba')
  const fail = async (e: unknown): Promise<never> => {
    if (e instanceof StepError) e.timings = { ...t.steps }
    if (e instanceof StepError || e instanceof SessionExpiredError) {
      await page.close().catch(() => {})
      throw e
    }
    const se = new StepError((e as Error).message || String(e), 'preparar', true, await shot(page, 'erro'))
    se.timings = { ...t.steps }
    await page.close().catch(() => {})
    throw se
  }
  try {
    input.onProgress?.('Abrindo o editor')
    const dlg = await openComposer(page, input.text, t)
    input.onProgress?.('Escrevendo o texto')
    await fillText(page, dlg, input.text)
    t.mark('texto')
    if (input.files.length) {
      input.onProgress?.(`Anexando ${input.files.length} mídia(s)`)
      await attachMedia(page, dlg, input.files, input.videos)
      t.mark('mídia')
    }
    const btn = postButton(dlg)
    try {
      await waitEnabled(btn, 20000 + input.videos * 120000)
    } catch (e) {
      const missing = (e as Error).message === 'botão não encontrado'
      throw new StepError(
        missing
          ? `Não encontrei o botão de publicar (procurei por: ${S().postButton.join(', ')}).`
          : 'O botão de publicar não ficou disponível (mídia ainda carregando ou conteúdo recusado).',
        'botão publicar',
        true,
        await shot(page, 'botao')
      )
    }
    t.mark('botão pronto')
    input.onProgress?.('Pronto para publicar')

    const commit = async () => {
      const ct = new Timer()
      input.onProgress?.('Publicando')
      const sel = S()
      await btn.click()
      ct.mark('clique')
      const okRe = anyOf(sel.postedTexts)
      const failRe = anyOf(sel.failTexts, false)
      const viewLink = page.locator(`a[href*="/@${input.handle}/post/"]`).filter({ hasText: anyOf(['Ver', 'View']) })
      // confirmação = aviso "Postado" / link "Ver", ou o editor fechar sem erro
      const result = await poll<'ok' | 'fail' | 'closed'>(async () => {
        if (await visible(viewLink)) return 'ok'
        if (await visible(page.getByText(okRe))) return 'ok'
        if (await visible(page.getByText(failRe))) return 'fail'
        if (!(await visible(composer(page)))) return 'closed'
        return null
      }, 45000 + input.videos * 240000, 150)
      ct.mark('confirmação')
      if (result === 'fail') {
        throw Object.assign(new StepError('O Threads recusou a publicação (mensagem de erro na tela).', 'confirmação', true, await shot(page, 'recusado')), { timings: ct.steps })
      }
      if (!result) {
        throw Object.assign(new StepError('A publicação não foi confirmada pelo Threads (tempo esgotado).', 'confirmação', false, await shot(page, 'timeout')), { timings: ct.steps })
      }
      if (result === 'closed') {
        // editor fechou: o upload pode continuar em segundo plano; espera o aviso por mais um pouco
        const late = await poll<'ok' | 'fail'>(async () => {
          if (await visible(viewLink)) return 'ok'
          if (await visible(page.getByText(okRe))) return 'ok'
          if (await visible(page.getByText(failRe))) return 'fail'
          return null
        }, 8000 + input.videos * 120000, 200)
        if (late === 'fail') {
          throw Object.assign(new StepError('O Threads recusou a publicação depois do envio.', 'confirmação', true, await shot(page, 'recusado')), { timings: ct.steps })
        }
        ct.mark('aviso final')
      }
      let url = (await viewLink.first().getAttribute('href', { timeout: 800 }).catch(() => null)) || undefined
      if (url?.startsWith('/')) url = S().base + url
      // sem link no aviso: o app descobre o link depois, em segundo plano (não segura a fila)
      return { url, timings: ct.steps }
    }
    return { commit, page, timings: t.steps }
  } catch (e) {
    return fail(e)
  }
}

export async function findPostUrl(page: Page, handle: string, text: string): Promise<string | null> {
  try {
    await goto(page, `${S().base}/@${handle}`)
    const snippet = norm(text).slice(0, 40)
    return await poll(async () => {
      const href = await page.evaluate(
        ({ handle, snippet }) => {
          const anchors = Array.from(document.querySelectorAll(`a[href*="/@${handle}/post/"]`)) as HTMLAnchorElement[]
          const clean = (h: string) => {
            const m = h.match(new RegExp(`/@${handle.replace(/\./g, '\\.')}/post/[^/?#]+`))
            return m ? m[0] : null
          }
          const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
          for (const a of anchors) {
            let el: HTMLElement | null = a
            for (let i = 0; i < 10 && el; i++) {
              el = el.parentElement
              if (el && snippet && norm(el.innerText || '').includes(snippet)) return clean(a.getAttribute('href') || '')
            }
          }
          return !snippet && anchors[0] ? clean(anchors[0].getAttribute('href') || '') : null
        },
        { handle, snippet }
      )
      return href ? S().base + href : null
    }, 8000, 400)
  } catch {
    return null
  }
}

// ---------- métricas ----------
export async function readPostMetrics(page: Page, url: string): Promise<PostMetrics | null> {
  await goto(page, url)
  const sel = S()
  const read = () =>
    page.evaluate(
      ({ groups, viewsWords }) => {
        const out: Record<string, string> = {}
        const lab = (s: Element) => (s.getAttribute('aria-label') || s.querySelector('title')?.textContent || '').trim()
        const svgs = Array.from(document.querySelectorAll('svg'))
        let found = false
        for (const [key, labels] of Object.entries(groups)) {
          const svg = svgs.find((s) => (labels as string[]).includes(lab(s)))
          if (!svg) continue
          found = true
          const btn = svg.closest('[role="button"]') || svg.parentElement?.parentElement
          out[key] = (btn?.textContent || '').trim()
        }
        const text = document.body?.innerText || ''
        const m = text.match(new RegExp(`(\\d[\\d.,]*\\s*(?:mil|mi|k|m)?)\\s*(?:${viewsWords.join('|')})\\b`, 'i'))
        out.views = m ? m[1] : ''
        return found ? out : null
      },
      {
        groups: { likes: sel.likeLabels, replies: sel.replyLabels, reposts: sel.repostLabels, shares: sel.shareLabels },
        viewsWords: sel.viewsWords
      }
    )
  const raw = await poll(read, 10000, 300)
  if (!raw) return null
  return {
    views: parseCount(raw.views),
    likes: parseCount(raw.likes) ?? 0,
    replies: parseCount(raw.replies) ?? 0,
    reposts: parseCount(raw.reposts) ?? 0,
    shares: parseCount(raw.shares)
  }
}
