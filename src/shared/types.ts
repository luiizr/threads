export type AccountStatus = 'connected' | 'expired' | 'checking' | 'error'

export interface Account {
  id: string
  handle: string
  name: string
  avatar?: string // data URL
  followers?: number
  status: AccountStatus
  paused: boolean
  lastCheckedAt?: number
  lastError?: string
  createdAt: number
  color: string
}

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'canceled'

export interface MediaItem {
  id: string
  path: string // cópia local dentro da pasta de dados do app
  name: string
  type: 'image' | 'video'
  size: number
}

export interface PostMetrics {
  views?: number
  likes: number
  replies: number
  reposts: number
  shares?: number
}

export interface Post {
  id: string
  code: string // identificador curto, ex. TF-1042
  accountId: string
  text: string
  media: MediaItem[]
  scheduledAt: number | null
  status: PostStatus
  attempts: number
  nextAttemptAt?: number
  progress?: string
  publishedAt?: number
  url?: string
  error?: string
  lastLogId?: string
  metrics?: PostMetrics
  metricsUpdatedAt?: number
  createdAt: number
  updatedAt: number
}

export interface FollowerSnapshot {
  accountId: string
  ts: number
  followers: number
}

export interface Settings {
  onboarded: boolean
  userName: string
  userRole: string
  autostart: boolean
  checkIntervalMin: number // 0 = manual
  metricsIntervalMin: number // 0 = manual
  notifyFailure: boolean
  notifyDisconnected: boolean
  notifySuccess: boolean
  notifySound: boolean
  maxConcurrent: number // 0 = automático pela memória do PC
  retries: number
  retryTransient: boolean
  pauseAccountOnError: boolean
  missedPolicy: 'publish' | 'skip'
  showBrowser: boolean
  prepareSeconds: number
  preventSleep: boolean
  lightMode: boolean // bloqueia imagens/vídeos/fontes do feed durante a automação
  sameAccountGapSec: number // intervalo mínimo entre dois posts da mesma conta
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  userName: '',
  userRole: 'Social Media',
  autostart: true,
  checkIntervalMin: 30,
  metricsIntervalMin: 120,
  notifyFailure: true,
  notifyDisconnected: true,
  notifySuccess: true,
  notifySound: false,
  maxConcurrent: 0,
  retries: 3,
  retryTransient: true,
  pauseAccountOnError: false,
  missedPolicy: 'publish',
  showBrowser: false,
  prepareSeconds: 90,
  preventSleep: true,
  lightMode: true,
  sameAccountGapSec: 20
}

export type LogLevel = 'info' | 'warn' | 'error'
export type LogCategory = 'Publicação' | 'Conta' | 'Fila' | 'Métricas' | 'Sistema'

export interface LogEntry {
  id: string
  ts: number
  level: LogLevel
  category: LogCategory
  accountId?: string
  postId?: string
  message: string
  details?: string
  screenshot?: string
  data?: Record<string, unknown>
}

export interface AppState {
  accounts: Account[]
  posts: Post[]
  settings: Settings
  followers: FollowerSnapshot[]
  runtime: {
    browserFound: boolean
    browserName?: string
    activeJobs: number
    concurrency: number
    connecting: boolean
    lastMetricsAt?: number
    lastCheckAt?: number
    version: string
    dataDir: string
  }
}

export interface NewPostInput {
  accountIds: string[]
  text: string
  mediaPaths: string[]
  scheduledAt: number | null // null = publicar agora
  draft: boolean
}

export interface PostPatch {
  text?: string
  mediaPaths?: string[] // lista completa (caminhos existentes ou novos)
  scheduledAt?: number | null
  accountId?: string
  draft?: boolean
}

export interface PickedFile {
  path: string
  name: string
  size: number
  type: 'image' | 'video'
}

export const MAX_CHARS = 500
export const MAX_MEDIA = 10
export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif']
export const VIDEO_EXT = ['mp4', 'mov']
