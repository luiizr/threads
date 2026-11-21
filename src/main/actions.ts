import { randomUUID } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { store } from './store'
import { log } from './log'
import { deleteSession } from './browser'
import { interactiveLogin } from './threads'
import { isInFlight, requestCancel, verifyAccount } from './scheduler'
import { p } from './paths'
import {
  Account,
  IMAGE_EXT,
  MAX_CHARS,
  MAX_MEDIA,
  MediaItem,
  NewPostInput,
  Post,
  PostPatch,
  VIDEO_EXT
} from '../shared/types'

const COLORS = ['#8B5CF6', '#22D3EE', '#10B981', '#F59E0B', '#EC4899', '#3B82F6', '#F97316', '#A3E635', '#E879F9', '#14B8A6']

// ---------- contas ----------
const loginState = { running: false, signal: { cancelled: false } }

export function isConnecting(): boolean {
  return loginState.running
}

export function cancelConnect(): void {
  loginState.signal.cancelled = true
}

export async function connectAccount(reconnectId?: string): Promise<{ ok: boolean; error?: string; accountId?: string }> {
  if (loginState.running) return { ok: false, error: 'Já existe uma janela de login aberta.' }
  loginState.running = true
  loginState.signal = { cancelled: false }
  store.emit('runtime')
  const tempId = reconnectId ?? randomUUID()
  try {
    log.info('Conta', reconnectId ? 'Janela de login aberta para reconectar conta.' : 'Janela de login aberta para nova conta.')
    const result = await interactiveLogin(tempId, loginState.signal)
    let handle = result.handle
    const existingByHandle = handle ? store.db.accounts.find((a) => a.handle.toLowerCase() === handle!.toLowerCase()) : undefined

    if (reconnectId) {
      const acc = store.account(reconnectId)!
      if (handle && acc.handle && handle.toLowerCase() !== acc.handle.toLowerCase() && !acc.handle.startsWith('conta-')) {
        log.warn('Conta', `Você entrou como @${handle}, mas estava reconectando @${acc.handle}. A sessão foi salva para @${acc.handle} mesmo assim; confira se é a conta certa.`, { accountId: acc.id })
      }
      store.updateAccount(reconnectId, {
        status: 'connected',
        lastCheckedAt: Date.now(),
        lastError: undefined,
        ...(handle && acc.handle.startsWith('conta-') ? { handle } : {}),
        ...(result.profile.name ? { name: result.profile.name } : {}),
        ...(result.profile.avatar ? { avatar: result.profile.avatar } : {}),
        ...(result.profile.followers !== undefined ? { followers: result.profile.followers } : {})
      })
      log.info('Conta', `@${store.account(reconnectId)!.handle} reconectada.`, { accountId: reconnectId })
      return { ok: true, accountId: reconnectId }
    }

    if (existingByHandle) {
      // a mesma conta de novo: só atualiza a sessão da existente
      const src = p.session(tempId)
      const dst = p.session(existingByHandle.id)
      copyFileSync(src, dst)
      deleteSession(tempId)
      store.updateAccount(existingByHandle.id, { status: 'connected', lastError: undefined, lastCheckedAt: Date.now() })
      log.info('Conta', `@${existingByHandle.handle} já estava cadastrada; sessão atualizada.`, { accountId: existingByHandle.id })
      return { ok: true, accountId: existingByHandle.id }
    }

    if (!handle) handle = `conta-${store.db.accounts.length + 1}`
    const account: Account = {
      id: tempId,
      handle,
      name: result.profile.name || handle,
      avatar: result.profile.avatar,
      followers: result.profile.followers,
      status: 'connected',
      paused: false,
      lastCheckedAt: Date.now(),
      createdAt: Date.now(),
      color: COLORS[store.db.accounts.length % COLORS.length]
    }
    store.db.accounts.push(account)
    if (account.followers !== undefined) store.db.followers.push({ accountId: account.id, ts: Date.now(), followers: account.followers })
    store.changed()
    if (handle.startsWith('conta-')) {
      log.warn('Conta', `Conta conectada, mas não consegui identificar o @ automaticamente. Edite o @ em Contas → Gerenciar.`, { accountId: account.id })
    } else {
      log.info('Conta', `@${handle} conectada com sucesso.`, { accountId: account.id })
    }
    return { ok: true, accountId: account.id }
  } catch (e) {
    if (!reconnectId) deleteSession(tempId)
    const msg = (e as Error).message
    log.warn('Conta', `Login não concluído: ${msg}`)
    return { ok: false, error: msg }
  } finally {
    loginState.running = false
    store.emit('runtime')
  }
}

export function updateAccountInfo(id: string, patch: { handle?: string; name?: string; paused?: boolean }): void {
  const clean: Partial<Account> = {}
  if (patch.handle !== undefined) clean.handle = patch.handle.replace(/^@/, '').trim()
  if (patch.name !== undefined) clean.name = patch.name.trim()
  if (patch.paused !== undefined) clean.paused = patch.paused
  store.updateAccount(id, clean)
  if (patch.paused !== undefined) {
    const a = store.account(id)
    log.info('Fila', `Fila de @${a?.handle} ${patch.paused ? 'pausada' : 'retomada'}.`, { accountId: id })
  }
}

export function removeAccount(id: string, deletePosts: boolean): void {
  const a = store.account(id)
  if (!a) return
  store.db.accounts = store.db.accounts.filter((x) => x.id !== id)
  const toDelete = store.db.posts.filter((x) => x.accountId === id && (deletePosts || x.status !== 'published'))
  for (const post of toDelete) removeMediaDir(post.id)
  store.db.posts = store.db.posts.filter((x) => !toDelete.includes(x))
  deleteSession(id)
  store.changed()
  log.info('Conta', `@${a.handle} removida do app.`)
}

export { verifyAccount }

// ---------- mídias ----------
export function mediaType(file: string): 'image' | 'video' | null {
  const ext = extname(file).slice(1).toLowerCase()
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (VIDEO_EXT.includes(ext)) return 'video'
  return null
}

function removeMediaDir(postId: string): void {
  try {
    rmSync(join(p.media(), postId), { recursive: true, force: true })
  } catch {
    /* ignora */
  }
}

function importMedia(postId: string, paths: string[], existing: MediaItem[] = []): MediaItem[] {
  const dir = join(p.media(), postId)
  mkdirSync(dir, { recursive: true })
  const out: MediaItem[] = []
  for (const src of paths) {
    const already = existing.find((m) => m.path === src)
    if (already) {
      out.push(already)
      continue
    }
    if (!existsSync(src)) throw new Error(`Arquivo não encontrado: ${src}`)
    const type = mediaType(src)
    if (!type) throw new Error(`Formato não suportado: ${basename(src)}. Use JPG, PNG, WEBP, GIF, MP4 ou MOV.`)
    const id = randomUUID().slice(0, 8)
    const dst = join(dir, `${id}${extname(src).toLowerCase()}`)
    copyFileSync(src, dst)
    out.push({ id, path: dst, name: basename(src), type, size: statSync(dst).size })
  }
  // apaga cópias que saíram da lista
  for (const m of existing) {
    if (!out.includes(m)) rmSync(m.path, { force: true })
  }
  return out
}

function validate(text: string, media: string[]): void {
  if (!text.trim() && !media.length) throw new Error('Escreva um texto ou adicione uma mídia.')
  if (text.length > MAX_CHARS) throw new Error(`O texto passa do limite de ${MAX_CHARS} caracteres.`)
  if (media.length > MAX_MEDIA) throw new Error(`No máximo ${MAX_MEDIA} mídias por publicação.`)
}

// ---------- publicações ----------
export function createPosts(input: NewPostInput): string[] {
  validate(input.text, input.mediaPaths)
  if (!input.accountIds.length) throw new Error('Escolha pelo menos uma conta.')
  const ids: string[] = []
  const now = Date.now()
  for (const accountId of input.accountIds) {
    const acc = store.account(accountId)
    if (!acc) continue
    const id = randomUUID()
    const post: Post = {
      id,
      code: store.nextCode(),
      accountId,
      text: input.text,
      media: importMedia(id, input.mediaPaths),
      scheduledAt: input.draft ? input.scheduledAt : input.scheduledAt ?? now,
      status: input.draft ? 'draft' : 'scheduled',
      attempts: 0,
      createdAt: now,
      updatedAt: now
    }
    store.db.posts.push(post)
    ids.push(id)
    log.info(
      'Fila',
      input.draft
        ? `Rascunho ${post.code} salvo para @${acc.handle}.`
        : input.scheduledAt && input.scheduledAt > now + 60000
          ? `${post.code} agendada para @${acc.handle} em ${new Date(input.scheduledAt).toLocaleString('pt-BR')}${post.media.length ? ` com ${post.media.length} mídia(s)` : ''}.`
          : `${post.code} enviada para publicação imediata em @${acc.handle}.`,
      { accountId, postId: id }
    )
  }
  store.changed()
  return ids
}

export function updatePost(id: string, patch: PostPatch): void {
  const post = store.post(id)
  if (!post) throw new Error('Publicação não encontrada.')
  if (isInFlight(id) || post.status === 'publishing') throw new Error('Esta publicação está sendo enviada agora.')
  if (post.status === 'published') throw new Error('Publicações já feitas não podem ser editadas.')
  const text = patch.text ?? post.text
  const mediaPaths = patch.mediaPaths ?? post.media.map((m) => m.path)
  validate(text, mediaPaths)
  const media = importMedia(id, mediaPaths, post.media)
  const next: Partial<Post> = { text, media }
  if (patch.accountId) next.accountId = patch.accountId
  if (patch.scheduledAt !== undefined) next.scheduledAt = patch.scheduledAt
  if (patch.draft !== undefined) {
    next.status = patch.draft ? 'draft' : 'scheduled'
    if (!patch.draft) {
      next.attempts = 0
      next.nextAttemptAt = undefined
      next.error = undefined
      if (next.scheduledAt == null && post.scheduledAt == null) next.scheduledAt = Date.now()
    }
  }
  store.updatePost(id, next)
  log.info('Fila', `${post.code} atualizada.`, { postId: id, accountId: post.accountId })
}

export function duplicatePost(id: string): string {
  const post = store.post(id)
  if (!post) throw new Error('Publicação não encontrada.')
  const [newId] = createPosts({
    accountIds: [post.accountId],
    text: post.text,
    mediaPaths: post.media.map((m) => m.path),
    scheduledAt: null,
    draft: true
  })
  return newId
}

export function deletePost(id: string): void {
  const post = store.post(id)
  if (!post) return
  if (isInFlight(id)) throw new Error('Cancele o envio antes de excluir.')
  store.db.posts = store.db.posts.filter((x) => x.id !== id)
  removeMediaDir(id)
  store.changed()
  log.info('Fila', `${post.code} excluída.`, { accountId: post.accountId })
}

export function cancelPost(id: string): void {
  const post = store.post(id)
  if (!post) return
  if (requestCancel(id)) return // cancela no próximo passo seguro
  if (post.status === 'scheduled') {
    store.updatePost(id, { status: 'canceled', nextAttemptAt: undefined })
    log.info('Fila', `${post.code} cancelada.`, { accountId: post.accountId, postId: id })
  }
}

export function retryPost(id: string): void {
  const post = store.post(id)
  if (!post || isInFlight(id)) return
  store.updatePost(id, { status: 'scheduled', scheduledAt: Date.now(), attempts: 0, nextAttemptAt: undefined, error: undefined })
  log.info('Fila', `Nova tentativa manual de ${post.code}.`, { accountId: post.accountId, postId: id })
}
