import { useMemo, useState } from 'react'
import { Search, Download, Trash2, X, XCircle, AlertTriangle, CheckCircle2, RotateCcw, RefreshCw, Copy, Info, HelpCircle, Wrench, ImageIcon, ChevronRight } from 'lucide-react'
import type { AppState, LogEntry, LogLevel } from '@shared/types'
import { api, useLogs } from '../api'
import { Avatar, Badge, Button, Empty, PageHeader, useRun, useToast } from '../ui'
import { cx, dayKey, fmtTimeSec, mediaUrl, ago } from '../util'
import type { Nav } from '../App'

const LEVEL: Record<LogLevel, { label: string; tone: 'ok' | 'warn' | 'bad'; icon: JSX.Element }> = {
  info: { label: 'Info', tone: 'ok', icon: <CheckCircle2 size={12} /> },
  warn: { label: 'Aviso', tone: 'warn', icon: <AlertTriangle size={12} /> },
  error: { label: 'Erro', tone: 'bad', icon: <XCircle size={12} /> }
}

function explain(l: LogEntry): { why: string; fix: string[] } | null {
  const m = l.message.toLowerCase()
  if (m.includes('sessão') && (m.includes('expir') || m.includes('login')))
    return { why: 'O Threads encerrou a sessão desta conta (troca de senha, login em outro lugar, verificação de segurança ou simplesmente tempo).', fix: ['Vá em Contas e clique em "Reconectar agora".', 'Faça o login na janela que abrir. As publicações pendentes saem em seguida.'] }
  if (m.includes('editor') || m.includes('botão publicar') || m.includes('texto não foi'))
    return { why: 'O app não encontrou o editor ou o botão de publicar no site do Threads. Pode ser lentidão, um aviso na tela do Threads ou uma mudança no site.', fix: ['Veja a captura de tela abaixo para entender o que apareceu.', 'Tente de novo. Se continuar, ative "Mostrar navegador durante publicações" em Configurações para acompanhar.'] }
  if (m.includes('recusou'))
    return { why: 'O próprio Threads exibiu uma mensagem de erro ao publicar (conteúdo, mídia ou limite da conta).', fix: ['Confira a captura de tela com a mensagem do Threads.', 'Ajuste o texto ou a mídia e tente de novo.'] }
  if (m.includes('internet') || m.includes('abrir o threads'))
    return { why: 'Sem conexão ou o Threads demorou demais para responder.', fix: ['Verifique a internet. O app tenta de novo sozinho conforme as Configurações.'] }
  if (m.includes('confirmar') || m.includes('confirmada'))
    return { why: 'O clique em Publicar foi feito, mas o Threads não mostrou a confirmação a tempo.', fix: ['Abra o perfil da conta no Threads e veja se o post saiu.', 'Só use "Tentar de novo" se não saiu, para não publicar em dobro.'] }
  return null
}

export default function Logs({ state, nav }: { state: AppState; nav: Nav }) {
  const logs = useLogs()
  const run = useRun()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [level, setLevel] = useState<'all' | LogLevel>('all')
  const [cat, setCat] = useState('')
  const [acc, setAcc] = useState('')
  const [selId, setSelId] = useState<string | undefined>(nav.opts.logId)
  const accMap = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts])

  const filtered = logs.filter(
    (l) =>
      (level === 'all' || l.level === level) &&
      (!cat || l.category === cat) &&
      (!acc || l.accountId === acc) &&
      (!q || `${l.message} ${l.id} ${l.details ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  )
  const shown = filtered.slice(0, 400)
  const groups: { day: string; items: LogEntry[] }[] = []
  for (const l of shown) {
    const d = dayKey(l.ts)
    if (!groups.length || groups[groups.length - 1].day !== d) groups.push({ day: d, items: [] })
    groups[groups.length - 1].items.push(l)
  }
  const sel = logs.find((l) => l.id === selId)
  const counts = { all: logs.length, info: logs.filter((l) => l.level === 'info').length, warn: logs.filter((l) => l.level === 'warn').length, error: logs.filter((l) => l.level === 'error').length }
  const dayLabel = (d: string) => {
    const t = dayKey(Date.now())
    const y = dayKey(Date.now() - 86400000)
    const nice = new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }).toUpperCase()
    return d === t ? `HOJE — ${nice}` : d === y ? `ONTEM — ${nice}` : nice
  }

  return (
    <div>
      <PageHeader
        title="Logs e diagnósticos"
        kicker={<Badge tone="ok" icon={<span className="h-1.5 w-1.5 rounded-full bg-ok" />}>Monitoramento ativo (local)</Badge>}
        subtitle="Histórico de tudo que o app fez: publicações, verificações de contas, fila e métricas."
        actions={
          <>
            <Button icon={<Download size={14} />} onClick={() => run(() => api.exportLogs('csv'))}>
              Exportar CSV
            </Button>
            <Button icon={<Download size={14} />} onClick={() => run(() => api.exportLogs('json'))}>
              JSON
            </Button>
            <Button kind="ghost" icon={<Trash2 size={14} />} onClick={() => run(() => api.clearLogs(30).then((n) => toast('ok', `${n} registro(s) com mais de 30 dias removidos.`)))}>
              Limpar logs antigos
            </Button>
          </>
        }
      />

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative w-80">
          <Search size={15} className="absolute left-3 top-2.5 text-mute" />
          <input className="input pl-9" placeholder="Buscar mensagem ou código (LOG-…)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {(['all', 'info', 'warn', 'error'] as const).map((l) => (
          <button key={l} onClick={() => setLevel(l)} className={cx('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5', level === l ? (l === 'error' ? 'border-bad/40 bg-bad/15 text-bad' : 'border-s3 bg-s2 text-white') : 'border-transparent text-sub hover:text-white')}>
            {l !== 'all' && <span className={cx('h-1.5 w-1.5 rounded-full', l === 'info' ? 'bg-ok' : l === 'warn' ? 'bg-warn' : 'bg-bad')} />}
            {l === 'all' ? 'Todos' : LEVEL[l].label} ({counts[l]})
          </button>
        ))}
        <select className="input w-44" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Tipo: todos</option>
          {['Publicação', 'Conta', 'Fila', 'Métricas', 'Sistema'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className="input w-48" value={acc} onChange={(e) => setAcc(e.target.value)}>
          <option value="">Todas as contas</option>
          {state.accounts.map((a) => (
            <option key={a.id} value={a.id}>@{a.handle}</option>
          ))}
        </select>
      </div>

      <div className={cx('grid gap-4', sel ? 'grid-cols-[1fr_400px]' : 'grid-cols-1')}>
        <div>
          {!shown.length ? (
            <div className="card">
              <Empty icon={<Info size={22} />} title="Nenhum registro" text="Os eventos do app aparecem aqui conforme acontecem." />
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.day} className="mb-4">
                <div className="kicker mb-2 flex justify-between px-1">
                  <span>{dayLabel(g.day)}</span>
                  <span className="normal-case">{g.items.length} eventos</span>
                </div>
                <div className="space-y-1.5">
                  {g.items.map((l) => {
                    const a = l.accountId ? accMap.get(l.accountId) : undefined
                    const L = LEVEL[l.level]
                    return (
                      <button
                        key={l.id}
                        onClick={() => setSelId(l.id === selId ? undefined : l.id)}
                        className={cx('card block w-full px-4 py-3 text-left transition hover:border-s3', l.id === selId && 'border-l-[3px] border-l-bad bg-s2', l.id === selId && l.level !== 'error' && 'border-l-violet')}
                      >
                        <div className="flex items-center gap-2">
                          <span className="mono text-sub">{fmtTimeSec(l.ts)}</span>
                          <Badge tone={L.tone} icon={L.icon}>{L.label}</Badge>
                          <span className="mono rounded bg-s2 px-1.5 py-0.5 text-sub">{l.category}</span>
                          {a && (
                            <span className="flex items-center gap-1.5 rounded-full bg-s2 py-0.5 pl-0.5 pr-2 text-sm">
                              <Avatar account={a} size={16} ring={false} />@{a.handle}
                            </span>
                          )}
                          {(l.screenshot || l.details) && <span className="mono ml-auto flex items-center gap-1 text-violet-soft">detalhes <ChevronRight size={12} /></span>}
                        </div>
                        <div className="mt-1.5 text-md">{l.message}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
          {filtered.length > shown.length && <div className="py-3 text-center text-sub">Mostrando os 400 mais recentes. Use os filtros para achar registros antigos.</div>}
        </div>

        {sel && <Detail l={sel} state={state} onClose={() => setSelId(undefined)} nav={nav} />}
      </div>
    </div>
  )
}

function Detail({ l, state, onClose, nav }: { l: LogEntry; state: AppState; onClose: () => void; nav: Nav }) {
  const run = useRun()
  const toast = useToast()
  const post = l.postId ? state.posts.find((p) => p.id === l.postId) : undefined
  const acc = l.accountId ? state.accounts.find((a) => a.id === l.accountId) : undefined
  const ex = l.level !== 'info' ? explain(l) : null
  return (
    <aside className="card sticky top-0 max-h-[calc(100vh-120px)] overflow-auto p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{l.level === 'error' ? 'Diagnóstico de erro' : l.level === 'warn' ? 'Aviso' : 'Evento'}</h2>
            <span className="mono rounded bg-bad/15 px-1.5 text-bad">#{l.id}</span>
          </div>
          <div className="mono text-sub">{new Date(l.ts).toLocaleString('pt-BR')} ({ago(l.ts)})</div>
        </div>
        <button className="rounded p-1 text-sub hover:bg-s2" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className={cx('mt-3 rounded-lg border px-3 py-2 text-base', l.level === 'error' ? 'border-bad/30 bg-bad/10 text-bad' : l.level === 'warn' ? 'border-warn/30 bg-warn/10 text-warn' : 'border-ok/30 bg-ok/10 text-ok')}>
        {l.message}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {post && (post.status === 'failed' || post.status === 'canceled') && (
          <Button kind="soft" icon={<RotateCcw size={14} />} onClick={() => run(() => api.retryPost(post.id), 'Nova tentativa na fila')}>
            Tentar novamente
          </Button>
        )}
        {acc?.status === 'expired' && (
          <Button icon={<RefreshCw size={14} />} onClick={() => nav.go('accounts')}>
            Reconectar
          </Button>
        )}
        <Button
          kind="ghost"
          icon={<Copy size={14} />}
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(l, null, 2))
            toast('ok', 'Copiado')
          }}
        >
          Copiar
        </Button>
      </div>

      {ex && (
        <>
          <Section icon={<HelpCircle size={16} className="text-warn" />} title="Por que aconteceu">
            {ex.why}
          </Section>
          <Section icon={<Wrench size={16} className="text-ok" />} title="Como resolver">
            <ol className="space-y-1.5">
              {ex.fix.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mono flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-s3 text-xs2">{i + 1}</span>
                  {f}
                </li>
              ))}
            </ol>
          </Section>
        </>
      )}

      {l.screenshot && (
        <Section icon={<ImageIcon size={16} />} title="Tela no momento do erro">
          <button onClick={() => api.openPath(l.screenshot!)} className="block w-full overflow-hidden rounded-lg border border-s3">
            <img src={mediaUrl(l.screenshot)} className="w-full" />
          </button>
          <div className="mt-1 text-sm text-sub">Clique para abrir em tamanho real.</div>
        </Section>
      )}

      {post && (
        <Section title="Publicação relacionada" icon={<Info size={16} />}>
          <div className="flex items-center gap-2 text-sm">
            <Avatar account={acc} size={20} ring={false} />@{acc?.handle} <span className="mono text-sub">{post.code}</span>
          </div>
          <div className="mt-1 line-clamp-3 text-base">“{post.text || '(só mídia)'}”</div>
          {post.media.map((m) => (
            <div key={m.id} className="mono mt-1.5 rounded bg-canvas px-2 py-1 text-sub">
              {m.name}
            </div>
          ))}
          <button className="mt-2 text-sm text-violet-soft hover:underline" onClick={() => nav.go('posts')}>
            Ver em Publicações
          </button>
        </Section>
      )}

      {(l.details || l.data) && (
        <Section title="Detalhes técnicos" icon={<Info size={16} />}>
          <pre className="mono max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sub">{[l.details, l.data ? JSON.stringify(l.data, null, 2) : ''].filter(Boolean).join('\n\n')}</pre>
        </Section>
      )}
    </aside>
  )
}

function Section({ icon, title, children }: { icon: JSX.Element; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg bg-canvas/60 p-3">
      <div className="mb-1.5 flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </div>
      <div className="text-base text-ink/90">{children}</div>
    </div>
  )
}
