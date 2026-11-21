import { existsSync, readFileSync } from 'fs'
import { p } from './paths'

/**
 * Textos e rótulos usados para localizar elementos no site do Threads.
 * Ficam aqui (e podem ser sobrescritos por data/selectors.json) porque o
 * Threads muda o site de tempos em tempos; assim dá para corrigir sem recompilar.
 */
export const DEFAULT_SELECTORS = {
  base: 'https://www.threads.com',
  postButton: ['Postar', 'Publicar', 'Post'],
  composerTrigger: ['Quais as novidades?', 'Quais são as novidades?', 'O que há de novo?', "What's new?", 'Comece uma thread...', 'Start a thread...'],
  createLabels: ['Criar', 'Create', 'Nova thread', 'New thread'],
  loginTexts: ['Entrar', 'Log in', 'Fazer login'],
  profileLabels: ['Perfil', 'Profile'],
  likeLabels: ['Curtir', 'Like', 'Descurtir', 'Unlike'],
  replyLabels: ['Responder', 'Reply', 'Comentar', 'Comment'],
  repostLabels: ['Repostar', 'Repost'],
  shareLabels: ['Compartilhar', 'Share'],
  postedTexts: ['Postado', 'Publicado', 'Posted'],
  failTexts: ['Não foi possível postar', 'Não foi possível publicar', "Couldn't post", 'Post failed', 'Falha ao publicar', 'Não foi possível carregar'],
  viewsWords: ['visualizações', 'visualização', 'views', 'view'],
  followersWords: ['seguidores', 'seguidor', 'followers', 'follower']
}

export type Selectors = typeof DEFAULT_SELECTORS

let cached: Selectors | null = null
let cachedAt = 0

export function S(): Selectors {
  if (cached && Date.now() - cachedAt < 60000) return cached
  let override: Partial<Selectors> = {}
  try {
    if (existsSync(p.selectors())) override = JSON.parse(readFileSync(p.selectors(), 'utf8'))
  } catch {
    /* ignora */
  }
  cached = { ...DEFAULT_SELECTORS, ...override }
  cachedAt = Date.now()
  return cached
}
