import { useMemo, useState } from 'react'
import {
  Infinity as Loop, Clock, RefreshCw, CheckCircle2, AlertCircle, FileText, Search, RotateCcw, Copy, Trash2, Pencil,
  ExternalLink, Eye, Heart, MessageCircle, Repeat2, ImageIcon, Film, Send, Ban, ChevronLeft, ChevronRight, Layers,
  TerminalSquare, List, CalendarDays, Plus
} from 'lucide-react'
import type { Account, AppState, Post, PostStatus } from '@shared/types'
import { api } from '../api'
import { ActionMenu, Avatar, Button, Empty, MenuItem, PageHeader, PostBadge, Segmented, StatCard, useConfirm, useRun } from '../ui'
import { cx, dayKey, fmtShort, fmtTime, mediaUrl, relDay } from '../util'
import type { Nav } from '../App'

type F = 'all' | PostStatus
const PAGE = 10
const DAY = 86400000

function untilText(ts: number): string {
  const m = Math.round((ts - Date.now()) / 60000)
  if (m <= 0) return 'agora'
  if (m < 60) return `em ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `em ${h} h`
  return `em ${Math.round(h / 24)} d`
}

export default function Posts({ state, nav }: { state: AppState; nav: Nav }) {
  const [filter, setFilter] = useState<F>((nav.opts.filter as F) || 'all')
  const [view, setView] = useState<'list' | 'week'>('list')
  const [q, setQ] = useState('')
  const [acc, setAcc] = useState<string>(nav.opts.accountId ?? '')
  const [sort, setSort] = useState<'recent' | 'old'>('recent')
  const [page, setPage] = useState(0)
  const { posts, accounts } = state
  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const count = (s: F) => posts.filter((p) => s === 'all' || p.status === s).length
  const when = (p: Post) => p.publishedAt ?? p.scheduledAt ?? p.updatedAt

  const filtered = posts
    .filter((p) => filter === 'all' || p.status === filter)
    .filter((p) => !acc || p.accountId === acc)
    .filter((p) => !q || `${p.text} ${p.code}`.toLowerCase().includes(q.toLowerCase()))
  const list = [...filtered].sort((a, b) => {
    const rank = (p: Post) => (p.status === 'publishing' ? 0 : p.status === 'failed' ? 1 : 2)
    if (sort === 'recent' && rank(a) !== rank(b)) return rank(a) - rank(b)
    return sort === 'recent' ? when(b) - when(a) : when(a) - when(b)
  })
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const shown = list.slice(cur * PAGE, cur * PAGE + PAGE)
  const next30 = posts.filter((p) => p.status === 'scheduled' && (p.scheduledAt ?? 0) < Date.now() + 30 * DAY).length
  const pick = (f: F) => {
    setFilter(f)
    setPage(0)
  }

  return (
    <div>
      <PageHeader
        title="Publicações e fila"
        kicker={<span className="mono rounded-full bg-s2 px-2 py-0.5 text-sub">{posts.length} itens</span>}
        subtitle="Agendamentos, histórico de envios e rascunhos de todas as contas."
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: <span className="flex items-center gap-1.5"><List size={14} /> Lista</span> },
              { value: 'week', label: <span className="flex items-center gap-1.5"><CalendarDays size={14} /> Semana</span> }
            ]}
          />
        }
      />

      <div className="mb-4 grid grid-cols-6 gap-3">
        <StatCard label="Todas" value={count('all')} icon={<Loop size={17} />} active={filter === 'all'} onClick={() => pick('all')} />
        <StatCard label="Agendados" value={count('scheduled')} tone="info" icon={<Clock size={17} />} active={filter === 'scheduled'} onClick={() => pick('scheduled')} />
        <StatCard label="Publicando" value={count('publishing')} tone="violet" icon={<RefreshCw size={17} />} active={filter === 'publishing'} onClick={() => pick('publishing')} />
        <StatCard label="Publicados" value={count('published')} tone="ok" icon={<CheckCircle2 size={17} />} active={filter === 'published'} onClick={() => pick('published')} />
        <StatCard label="Falharam" value={count('failed')} tone="bad" icon={<AlertCircle size={17} />} active={filter === 'failed'} onClick={() => pick('failed')} />
        <StatCard label="Rascunhos" value={count('draft')} tone="mute" icon={<FileText size={17} />} active={filter === 'draft'} onClick={() => pick('draft')} />
      </div>

      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <div className="relative w-80">
          <Search size={15} className="absolute left-3 top-2.5 text-mute" />
          <input className="input pl-9" placeholder="Buscar texto ou código (TF-…)" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
        </div>
        <select className="input w-60" value={acc} onChange={(e) => { setAcc(e.target.value); setPage(0) }}>
          <option value="">Todas as contas ({accounts.length})</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>@{a.handle}</option>
          ))}
        </select>
        <div className="flex-1" />
        {view === 'list' && (
          <select className="input w-56" value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'old')} aria-label="Ordenar">
            <option value="recent">Mais recentes primeiro</option>
            <option value="old">Mais antigas primeiro</option>
          </select>
        )}
      </div>

      {view === 'week' ? (
        <Week posts={filtered} accMap={accMap} nav={nav} />
      ) : !shown.length ? (
        <div className="card">
          <Empty
            icon={<Layers size={22} />}
            title={posts.length ? 'Nada encontrado com esses filtros' : 'Nenhuma publicação ainda'}
            text={posts.length ? undefined : 'Crie a primeira publicação e escolha quando ela deve sair.'}
            action={!posts.length && <Button kind="primary" onClick={() => nav.go('compose')}>Nova publicação</Button>}
          />
        </div>
      ) : (
        <>
          <div className="kicker grid grid-cols-[220px_1fr_230px_190px] px-5 pb-2">
            <span>Data e conta</span>
            <span>Conteúdo</span>
            <span>Status</span>
            <span className="text-right">Ações</span>
          </div>
          <div className="space-y-2">
            {shown.map((p) => (
              <Row key={p.id} p={p} a={accMap.get(p.accountId)} ts={when(p)} nav={nav} />
            ))}
          </div>
          <div className="card mt-3 flex items-center justify-between px-4 py-3">
            <span>
              Mostrando <b>{cur * PAGE + 1}–{Math.min(list.length, cur * PAGE + PAGE)}</b> de <b>{list.length}</b>
              <span className="mono ml-3 text-info">{next30} agendamento(s) nos próximos 30 dias</span>
            </span>
            <div className="flex items-center gap-1">
              <Button kind="ghost" size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)} icon={<ChevronLeft size={14} />} aria-label="Página anterior" />
              <span className="mono px-2">{cur + 1} / {pages}</span>
              <Button kind="ghost" size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} icon={<ChevronRight size={14} />} aria-label="Próxima página" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Row({ p, a, ts, nav }: { p: Post; a?: Account; ts: number; nav: Nav }) {
  const run = useRun()
  const confirm = useConfirm()
  const edge = { failed: 'border-l-bad', publishing: 'border-l-violet', scheduled: 'border-l-info', published: 'border-l-ok', draft: 'border-l-s3', canceled: 'border-l-s3' }[p.status]
  const retrying = p.status === 'scheduled' && !!p.nextAttemptAt

  const del = async () => {
    const ok = await confirm({
      title: 'Excluir publicação?',
      text: p.status === 'published' ? 'Ela sai só do histórico do ThreadFlow. O post continua no Threads.' : `${p.code} e as mídias anexadas serão apagadas do app.`,
      confirmLabel: 'Excluir',
      danger: true
    })
    if (ok) run(() => api.deletePost(p.id), 'Publicação excluída')
  }
  const cancel = async () => {
    const ok = await confirm({ title: 'Cancelar agendamento?', text: 'A publicação não será enviada. Você pode reagendar depois.', confirmLabel: 'Cancelar agendamento', danger: true })
    if (ok) run(() => api.cancelPost(p.id), 'Agendamento cancelado')
  }

  // ação principal visível + o resto no menu ⋯
  const primary =
    p.status === 'failed' ? (
      <Button kind="danger" size="sm" icon={<RotateCcw size={13} />} onClick={() => run(() => api.retryPost(p.id), 'Nova tentativa na fila')}>
        Tentar de novo
      </Button>
    ) : p.status === 'publishing' ? (
      <Button kind="ghost" size="sm" icon={<Ban size={13} />} onClick={() => run(() => api.cancelPost(p.id), 'Cancelamento solicitado')}>
        Cancelar envio
      </Button>
    ) : p.status === 'scheduled' ? (
      <Button kind="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => nav.go('compose', { editId: p.id })}>
        Editar
      </Button>
    ) : p.status === 'draft' || p.status === 'canceled' ? (
      <Button kind="soft" size="sm" icon={<Pencil size={13} />} onClick={() => nav.go('compose', { editId: p.id })}>
        {p.status === 'draft' ? 'Continuar' : 'Reagendar'}
      </Button>
    ) : p.url ? (
      <Button kind="ghost" size="sm" icon={<ExternalLink size={13} />} onClick={() => api.openExternal(p.url!)}>
        Ver no Threads
      </Button>
    ) : null

  const menu: MenuItem[] = [
    { label: 'Publicar agora', icon: <Send size={14} />, onClick: () => run(() => api.publishNow(p.id), 'Publicando agora'), hidden: p.status !== 'scheduled' },
    { label: 'Cancelar agendamento', icon: <Ban size={14} />, onClick: cancel, hidden: p.status !== 'scheduled' },
    { label: 'Ver diagnóstico', icon: <TerminalSquare size={14} />, onClick: () => nav.go('logs', { logId: p.lastLogId }), hidden: !p.lastLogId },
    { label: 'Duplicar como rascunho', icon: <Copy size={14} />, onClick: () => run(() => api.duplicatePost(p.id), 'Duplicado como rascunho'), hidden: p.status === 'publishing' },
    { label: 'Excluir', icon: <Trash2 size={14} />, onClick: del, danger: true, hidden: p.status === 'publishing' }
  ]

  const statusLine =
    p.status === 'publishing'
      ? p.progress ?? 'Enviando…'
      : retrying
        ? `Tentativa ${p.attempts + 1} às ${fmtTime(p.nextAttemptAt!)}`
        : p.status === 'scheduled' && a?.status === 'expired'
          ? 'Aguardando reconectar a conta'
          : p.status === 'scheduled' && a?.paused
            ? 'Fila da conta pausada'
            : p.status === 'scheduled' && p.scheduledAt
              ? untilText(p.scheduledAt)
              : p.status === 'published'
                ? p.metricsUpdatedAt
                  ? `Métricas de ${relDay(p.metricsUpdatedAt).toLowerCase()} ${fmtTime(p.metricsUpdatedAt)}`
                  : 'Métricas em breve'
                : p.status === 'failed' && p.attempts > 0
                  ? `${p.attempts} tentativa(s)`
                  : ''

  return (
    <div className={cx('card grid grid-cols-[220px_1fr_230px_190px] items-center gap-3 border-l-[3px] px-5 py-3.5', edge)}>
      <div className="min-w-0">
        <div className="mb-2">
          <span className={cx('mono rounded px-1.5 py-0.5 font-semibold', p.status === 'failed' ? 'bg-bad/15 text-bad' : p.status === 'published' ? 'bg-ok/10 text-ok' : p.status === 'draft' || p.status === 'canceled' ? 'bg-s2 text-sub' : 'bg-info/10 text-info')}>
            {p.status === 'draft' && !p.scheduledAt ? 'Sem data' : `${relDay(ts)}, ${fmtTime(ts)}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Avatar account={a} size={28} />
          <div className="min-w-0">
            <div className="truncate font-medium">@{a?.handle ?? 'conta removida'}</div>
            <div className="mono text-mute">{p.code}</div>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 gap-3">
        <Thumb post={p} />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-md">{p.text || <span className="text-sub">(só mídia)</span>}</div>
          {p.status === 'failed' && p.error && (
            <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-bad/10 px-2 py-1.5 text-sm text-bad">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span className="line-clamp-2">{p.error}</span>
            </div>
          )}
          {p.status === 'publishing' && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-s2">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-violet" />
            </div>
          )}
          {p.status === 'published' && p.metrics && (
            <div className="mono mt-1.5 flex gap-3 text-sub">
              {p.metrics.views != null && <span className="flex items-center gap-1" title="Visualizações"><Eye size={12} />{fmtShort(p.metrics.views)}</span>}
              <span className="flex items-center gap-1" title="Curtidas"><Heart size={12} />{fmtShort(p.metrics.likes)}</span>
              <span className="flex items-center gap-1" title="Respostas"><MessageCircle size={12} />{fmtShort(p.metrics.replies)}</span>
              <span className="flex items-center gap-1" title="Reposts"><Repeat2 size={12} />{fmtShort(p.metrics.reposts)}</span>
            </div>
          )}
          {p.media.length > 1 && <div className="mono mt-1 text-violet-soft">Carrossel ({p.media.length} mídias)</div>}
        </div>
      </div>

      <div>
        <PostBadge status={p.status} retrying={retrying} />
        {statusLine && <div className="mono mt-1.5 text-sub">{statusLine}</div>}
      </div>

      <div className="flex items-center justify-end gap-1">
        {primary}
        <ActionMenu items={menu} />
      </div>
    </div>
  )
}

function Week({ posts, accMap, nav }: { posts: Post[]; accMap: Map<string, Account>; nav: Nav }) {
  const [offset, setOffset] = useState(0)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setTime(start.getTime() + offset * 7 * DAY)
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY))
  const byDay = new Map<string, Post[]>()
  for (const p of posts) {
    const ts = p.publishedAt ?? p.scheduledAt
    if (!ts) continue
    const k = dayKey(ts)
    byDay.set(k, [...(byDay.get(k) ?? []), p])
  }
  const color: Record<PostStatus, string> = {
    scheduled: 'border-info/40 bg-info/10',
    publishing: 'border-violet/50 bg-violet/15',
    published: 'border-ok/30 bg-ok/10',
    failed: 'border-bad/40 bg-bad/10',
    draft: 'border-s3 bg-s2',
    canceled: 'border-s3 bg-s2 opacity-60'
  }
  const today = dayKey(Date.now())
  return (
    <div className="card p-3">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-1">
          <Button kind="ghost" size="sm" icon={<ChevronLeft size={14} />} onClick={() => setOffset(offset - 1)} aria-label="Semana anterior" />
          <Button kind="ghost" size="sm" onClick={() => setOffset(0)} disabled={offset === 0}>
            Hoje
          </Button>
          <Button kind="ghost" size="sm" icon={<ChevronRight size={14} />} onClick={() => setOffset(offset + 1)} aria-label="Próxima semana" />
        </div>
        <span className="font-medium">
          {offset === 0 && <span className="mr-2 text-sub">Próximos 7 dias ·</span>}
          {days[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – {days[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const k = dayKey(d.getTime())
          const items = (byDay.get(k) ?? []).sort((a, b) => (a.publishedAt ?? a.scheduledAt ?? 0) - (b.publishedAt ?? b.scheduledAt ?? 0))
          return (
            <div key={k} className={cx('flex min-h-[420px] flex-col rounded-lg border p-2', k === today ? 'border-violet/40 bg-violet/5' : 'border-s2 bg-canvas/40')}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className={cx('text-sm font-semibold capitalize', k === today ? 'text-violet-soft' : 'text-sub')}>{d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
                <span className={cx('text-lg font-bold tabular', k === today && 'text-violet-soft')}>{d.getDate()}</span>
              </div>
              <div className="flex-1 space-y-1.5">
                {items.map((p) => {
                  const a = accMap.get(p.accountId)
                  const ts = p.publishedAt ?? p.scheduledAt!
                  return (
                    <button
                      key={p.id}
                      onClick={() => (p.status === 'published' && p.url ? api.openExternal(p.url) : p.status !== 'publishing' && nav.go('compose', { editId: p.id }))}
                      className={cx('w-full rounded-md border px-2 py-1.5 text-left transition hover:brightness-125', color[p.status])}
                      title={p.text}
                    >
                      <div className="flex items-center gap-1.5">
                        <Avatar account={a} size={16} ring={false} />
                        <span className="mono font-semibold">{fmtTime(ts)}</span>
                      </div>
                      <div className="mt-0.5 truncate text-sm">@{a?.handle}</div>
                      <div className="line-clamp-2 text-xs text-sub">{p.text || '(só mídia)'}</div>
                    </button>
                  )
                })}
              </div>
              {dayKey(d.getTime()) >= today && (
                <button
                  onClick={() => nav.go('compose')}
                  className="mt-2 flex items-center justify-center gap-1 rounded-md border border-dashed border-s3 py-1.5 text-sm text-sub hover:border-violet hover:text-white"
                >
                  <Plus size={12} /> Agendar
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Thumb({ post }: { post: Post }) {
  const m = post.media[0]
  if (!m)
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-s3 text-mute">
        <FileText size={18} />
      </div>
    )
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-s3 bg-canvas">
      {m.type === 'image' ? <img src={mediaUrl(m.path)} className="h-full w-full object-cover" /> : <video src={mediaUrl(m.path)} className="h-full w-full object-cover" muted />}
      <span className="mono absolute bottom-0 right-0 flex items-center gap-0.5 rounded-tl bg-black/70 px-1 text-xs2">
        {m.type === 'video' ? <Film size={9} /> : <ImageIcon size={9} />}
        {post.media.length > 1 ? post.media.length : m.name.split('.').pop()?.toUpperCase()}
      </span>
    </div>
  )
}
