import { useMemo, useState } from 'react'
import {
  Infinity as Loop, Clock, RefreshCw, CheckCircle2, AlertCircle, FileText, Search, Plus, RotateCcw, Copy, Trash2, Pencil,
  ExternalLink, Eye, Heart, MessageCircle, Repeat2, ImageIcon, Film, Send, Ban, ChevronLeft, ChevronRight, Layers, TerminalSquare
} from 'lucide-react'
import type { AppState, Post, PostStatus } from '@shared/types'
import { api } from '../api'
import { Avatar, Button, Empty, PageHeader, PostBadge, StatCard, useRun } from '../ui'
import { cx, fmtShort, fmtTime, mediaUrl, relDay } from '../util'
import type { Nav } from '../App'

type F = 'all' | PostStatus
const PAGE = 10

export default function Posts({ state, nav }: { state: AppState; nav: Nav }) {
  const [filter, setFilter] = useState<F>((nav.opts.filter as F) || 'all')
  const [q, setQ] = useState('')
  const [acc, setAcc] = useState<string>(nav.opts.accountId ?? '')
  const [sort, setSort] = useState<'recent' | 'old'>('recent')
  const [page, setPage] = useState(0)
  const run = useRun()
  const { posts, accounts } = state
  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const count = (s: F) => posts.filter((p) => (s === 'all' ? true : s === 'failed' ? p.status === 'failed' : p.status === s)).length
  const when = (p: Post) => p.publishedAt ?? p.scheduledAt ?? p.updatedAt

  const list = posts
    .filter((p) => filter === 'all' || p.status === filter)
    .filter((p) => !acc || p.accountId === acc)
    .filter((p) => !q || `${p.text} ${p.code}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      // fila ativa primeiro, depois por data
      const rank = (p: Post) => (p.status === 'publishing' ? 0 : p.status === 'failed' ? 1 : 2)
      if (sort === 'recent' && rank(a) !== rank(b)) return rank(a) - rank(b)
      return sort === 'recent' ? when(b) - when(a) : when(a) - when(b)
    })
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const shown = list.slice(cur * PAGE, cur * PAGE + PAGE)
  const next30 = posts.filter((p) => p.status === 'scheduled' && (p.scheduledAt ?? 0) < Date.now() + 30 * 86400000).length

  return (
    <div>
      <PageHeader
        title="Publicações e fila"
        kicker={<span className="mono rounded-full bg-s2 px-2 py-0.5 text-sub">{posts.length} itens</span>}
        subtitle="Agendamentos, histórico de envios e rascunhos de todas as contas."
        actions={
          <Button kind="primary" size="lg" icon={<Plus size={16} />} onClick={() => nav.go('compose')}>
            Nova publicação
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-6 gap-3">
        <StatCard label="Todas" value={count('all')} icon={<Loop size={17} />} active={filter === 'all'} onClick={() => { setFilter('all'); setPage(0) }} />
        <StatCard label="Agendados" value={count('scheduled')} tone="info" icon={<Clock size={17} />} active={filter === 'scheduled'} onClick={() => { setFilter('scheduled'); setPage(0) }} />
        <StatCard label="Publicando" value={count('publishing')} tone="violet" icon={<RefreshCw size={17} />} active={filter === 'publishing'} onClick={() => { setFilter('publishing'); setPage(0) }} />
        <StatCard label="Publicados" value={count('published')} tone="ok" icon={<CheckCircle2 size={17} />} active={filter === 'published'} onClick={() => { setFilter('published'); setPage(0) }} />
        <StatCard label="Falharam" value={count('failed')} tone="bad" icon={<AlertCircle size={17} />} active={filter === 'failed'} onClick={() => { setFilter('failed'); setPage(0) }} />
        <StatCard label="Rascunhos" value={count('draft')} tone="mute" icon={<FileText size={17} />} active={filter === 'draft'} onClick={() => { setFilter('draft'); setPage(0) }} />
      </div>

      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <div className="relative w-80">
          <Search size={15} className="absolute left-3 top-2.5 text-mute" />
          <input className="input pl-9" placeholder="Buscar texto ou código (TF-…)" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
        </div>
        <select className="input w-56" value={acc} onChange={(e) => { setAcc(e.target.value); setPage(0) }}>
          <option value="">Contas: todas ({accounts.length})</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>@{a.handle}</option>
          ))}
        </select>
        <div className="flex-1" />
        <span className="text-sub">Ordenar:</span>
        <select className="input w-48" value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'old')}>
          <option value="recent">Mais recentes primeiro</option>
          <option value="old">Mais antigas primeiro</option>
        </select>
      </div>

      {!shown.length ? (
        <div className="card">
          <Empty icon={<Layers size={22} />} title={posts.length ? 'Nada encontrado com esses filtros' : 'Nenhuma publicação ainda'} text={posts.length ? undefined : 'Crie a primeira publicação e escolha quando ela deve sair.'} action={!posts.length && <Button kind="primary" onClick={() => nav.go('compose')}>Nova publicação</Button>} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[220px_1fr_230px_200px] px-5 pb-2 kicker">
            <span>Data e conta</span>
            <span>Conteúdo e mídia</span>
            <span>Status</span>
            <span className="text-right">Ações</span>
          </div>
          <div className="space-y-2">
            {shown.map((p) => {
              const a = accMap.get(p.accountId)
              const ts = when(p)
              const edge = { failed: 'border-l-bad', publishing: 'border-l-violet', scheduled: 'border-l-info', published: 'border-l-ok', draft: 'border-l-s3', canceled: 'border-l-s3' }[p.status]
              const retrying = p.status === 'scheduled' && !!p.nextAttemptAt
              return (
                <div key={p.id} className={cx('card grid grid-cols-[220px_1fr_230px_200px] items-center gap-3 border-l-[3px] px-5 py-3.5', edge)}>
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className={cx('mono rounded px-1.5 py-0.5 font-semibold', p.status === 'failed' ? 'bg-bad/15 text-bad' : p.status === 'published' ? 'bg-ok/10 text-ok' : p.status === 'draft' ? 'bg-s2 text-sub' : 'bg-info/10 text-info')}>
                        {p.status === 'draft' ? (p.scheduledAt ? `${relDay(p.scheduledAt)}, ${fmtTime(p.scheduledAt)}` : 'Sem data') : `${relDay(ts)}, ${fmtTime(ts)}`}
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
                          {p.metrics.views != null && <span className="flex items-center gap-1"><Eye size={12} />{fmtShort(p.metrics.views)}</span>}
                          <span className="flex items-center gap-1"><Heart size={12} />{fmtShort(p.metrics.likes)}</span>
                          <span className="flex items-center gap-1"><MessageCircle size={12} />{fmtShort(p.metrics.replies)}</span>
                          <span className="flex items-center gap-1"><Repeat2 size={12} />{fmtShort(p.metrics.reposts)}</span>
                        </div>
                      )}
                      {p.media.length > 1 && <div className="mono mt-1 text-violet-soft">Carrossel ({p.media.length} mídias)</div>}
                    </div>
                  </div>

                  <div>
                    <PostBadge status={p.status} retrying={retrying} />
                    <div className="mono mt-1.5 text-sub">
                      {p.status === 'publishing'
                        ? p.progress ?? 'Enviando…'
                        : retrying
                          ? `Tentativa ${p.attempts + 1} às ${fmtTime(p.nextAttemptAt!)}`
                          : p.status === 'scheduled' && a?.status === 'expired'
                            ? 'Aguardando reconectar a conta'
                            : p.status === 'scheduled' && a?.paused
                              ? 'Fila da conta pausada'
                              : p.status === 'published'
                                ? p.metricsUpdatedAt ? `Métricas ${relDay(p.metricsUpdatedAt).toLowerCase()} ${fmtTime(p.metricsUpdatedAt)}` : 'Métricas pendentes'
                                : p.status === 'failed'
                                  ? `${p.attempts} tentativa(s)`
                                  : ''}
                    </div>
                    {p.lastLogId && (p.status === 'failed' || retrying) && (
                      <button className="mt-1 flex items-center gap-1 text-sm text-violet-soft hover:underline" onClick={() => nav.go('logs', { logId: p.lastLogId })}>
                        <TerminalSquare size={12} /> Ver diagnóstico
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1">
                    {p.status === 'failed' && (
                      <Button kind="danger" size="sm" icon={<RotateCcw size={13} />} onClick={() => run(() => api.retryPost(p.id), 'Nova tentativa na fila')}>
                        Tentar de novo
                      </Button>
                    )}
                    {p.status === 'publishing' && (
                      <Button kind="ghost" size="sm" icon={<Ban size={13} />} onClick={() => run(() => api.cancelPost(p.id), 'Cancelamento solicitado')}>
                        Cancelar envio
                      </Button>
                    )}
                    {p.status === 'scheduled' && (
                      <>
                        <Button kind="ghost" size="sm" icon={<Send size={13} />} title="Publicar agora" onClick={() => run(() => api.publishNow(p.id), 'Publicando agora')} />
                        <Button kind="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => nav.go('compose', { editId: p.id })}>
                          Editar
                        </Button>
                        <Button kind="ghost" size="sm" icon={<Ban size={13} />} title="Cancelar agendamento" onClick={() => run(() => api.cancelPost(p.id), 'Agendamento cancelado')} />
                      </>
                    )}
                    {(p.status === 'draft' || p.status === 'canceled') && (
                      <Button kind="soft" size="sm" icon={<Pencil size={13} />} onClick={() => nav.go('compose', { editId: p.id })}>
                        {p.status === 'draft' ? 'Continuar' : 'Reagendar'}
                      </Button>
                    )}
                    {p.status === 'published' && p.url && (
                      <Button kind="ghost" size="sm" icon={<ExternalLink size={13} />} onClick={() => api.openExternal(p.url!)}>
                        Ver no Threads
                      </Button>
                    )}
                    {p.status !== 'publishing' && (
                      <Button kind="ghost" size="sm" icon={<Copy size={13} />} title="Duplicar como rascunho" onClick={() => run(() => api.duplicatePost(p.id), 'Duplicado como rascunho')} />
                    )}
                    {p.status !== 'publishing' && (
                      <Button
                        kind="ghost"
                        size="sm"
                        icon={<Trash2 size={13} />}
                        title="Excluir"
                        onClick={() => {
                          if (confirm(p.status === 'published' ? 'Excluir do histórico do ThreadFlow? (o post continua no Threads)' : 'Excluir esta publicação?')) run(() => api.deletePost(p.id), 'Excluída')
                        }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="card mt-3 flex items-center justify-between px-4 py-3">
            <span>
              Mostrando <b>{cur * PAGE + 1}–{Math.min(list.length, cur * PAGE + PAGE)}</b> de <b>{list.length}</b>
              <span className="mono ml-3 text-info">{next30} agendamento(s) nos próximos 30 dias</span>
            </span>
            <div className="flex items-center gap-1">
              <Button kind="ghost" size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)} icon={<ChevronLeft size={14} />} />
              <span className="mono px-2">{cur + 1} / {pages}</span>
              <Button kind="ghost" size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} icon={<ChevronRight size={14} />} />
            </div>
          </div>
        </>
      )}
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
