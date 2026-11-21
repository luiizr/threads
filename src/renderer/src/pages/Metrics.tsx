import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Eye, Heart, MessageSquare, Repeat2, UserPlus, AlertCircle, RefreshCw, ArrowUp, ArrowDown, ExternalLink, ChevronRight, PlusCircle, BarChart3 } from 'lucide-react'
import type { Account, AppState, Post } from '@shared/types'
import { api } from '../api'
import { AccountBadge, Avatar, Button, Empty, Segmented, useRun } from '../ui'
import { ago, cx, dayKey, fmtNum, fmtShort, fmtTime, greeting, relDay } from '../util'
import type { Nav } from '../App'

const DAY = 86400000

export default function Metrics({ state, nav }: { state: AppState; nav: Nav }) {
  const [days, setDays] = useState<7 | 30 | 90>(7)
  const [only, setOnly] = useState<string>(nav.opts.accountId ?? '')
  const [hidden, setHidden] = useState<string[]>([])
  const [metric, setMetric] = useState<'views' | 'eng'>('views')
  const [topBy, setTopBy] = useState<'views' | 'eng'>('views')
  const [refreshing, setRefreshing] = useState(false)
  const run = useRun()
  const { accounts, posts, followers, settings } = state

  const accs = only ? accounts.filter((a) => a.id === only) : accounts
  const accIds = new Set(accs.map((a) => a.id))
  const now = Date.now()
  const start = now - days * DAY
  const prevStart = start - days * DAY
  const eng = (p: Post) => (p.metrics ? p.metrics.likes + p.metrics.replies + p.metrics.reposts : 0)

  const pub = posts.filter((p) => p.status === 'published' && p.publishedAt && accIds.has(p.accountId))
  const cur = pub.filter((p) => p.publishedAt! >= start)
  const prev = pub.filter((p) => p.publishedAt! >= prevStart && p.publishedAt! < start)

  const sum = (list: Post[], k: 'views' | 'likes' | 'replies' | 'reposts') => list.reduce((s, p) => s + (p.metrics?.[k] ?? 0), 0)

  const followerDelta = (from: number, to: number) => {
    let total = 0
    let any = false
    for (const a of accs) {
      const snaps = followers.filter((f) => f.accountId === a.id)
      const before = [...snaps].reverse().find((f) => f.ts <= from) ?? snaps.find((f) => f.ts >= from)
      const after = [...snaps].reverse().find((f) => f.ts <= to)
      if (before && after && after.ts > before.ts) {
        total += after.followers - before.followers
        any = true
      }
    }
    return any ? total : null
  }

  const kpis = [
    { label: 'Visualizações', icon: <Eye size={16} />, v: sum(cur, 'views'), p: sum(prev, 'views') },
    { label: 'Curtidas', icon: <Heart size={16} />, v: sum(cur, 'likes'), p: sum(prev, 'likes') },
    { label: 'Respostas', icon: <MessageSquare size={16} />, v: sum(cur, 'replies'), p: sum(prev, 'replies') },
    { label: 'Reposts', icon: <Repeat2 size={16} />, v: sum(cur, 'reposts'), p: sum(prev, 'reposts') },
    { label: 'Novos seguidores', icon: <UserPlus size={16} />, v: followerDelta(start, now), p: followerDelta(prevStart, start), signed: true }
  ]

  const chart = useMemo(() => {
    const rows: Record<string, number | string>[] = []
    for (let i = days - 1; i >= 0; i--) {
      const ts = now - i * DAY
      const row: Record<string, number | string> = { key: dayKey(ts), label: new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') }
      for (const a of accs) row[a.id] = 0
      rows.push(row)
    }
    const idx = new Map(rows.map((r, i) => [r.key as string, i]))
    for (const p of cur) {
      const i = idx.get(dayKey(p.publishedAt!))
      if (i === undefined) continue
      rows[i][p.accountId] = (rows[i][p.accountId] as number) + (metric === 'views' ? p.metrics?.views ?? 0 : eng(p))
    }
    return rows
  }, [cur.length, days, metric, accs.map((a) => a.id).join(), posts])

  const upcoming = posts
    .filter((p) => p.status === 'scheduled' && accIds.has(p.accountId))
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
    .slice(0, 5)
  const top = [...cur].sort((a, b) => (topBy === 'views' ? (b.metrics?.views ?? 0) - (a.metrics?.views ?? 0) : eng(b) - eng(a))).slice(0, 4)
  const expired = accounts.filter((a) => a.status === 'expired')
  const accMap = new Map(accounts.map((a) => [a.id, a]))

  const refresh = async () => {
    setRefreshing(true)
    await run(() => api.refreshMetrics(only || undefined), 'Métricas atualizadas')
    setRefreshing(false)
  }

  if (!accounts.length) {
    return (
      <div className="card">
        <Empty icon={<BarChart3 size={22} />} title={`${greeting()}, ${settings.userName || 'pessoal'}!`} text="Conecte uma conta do Threads para ver as métricas aqui." action={<Button kind="primary" onClick={() => nav.go('accounts')}>Conectar conta</Button>} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting()}, {settings.userName.split(' ')[0] || 'pessoal'} 👋
          </h1>
          <p className="mt-1 text-md text-sub">
            Desempenho das publicações feitas pelo ThreadFlow em {only ? `@${accMap.get(only)?.handle}` : `${accounts.length} conta(s)`} nos últimos {days} dias.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button kind="ghost" icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />} disabled={refreshing} onClick={refresh}>
            <span className="text-left leading-tight">
              Atualizar métricas
              <span className="mono block text-mute">{ago(state.runtime.lastMetricsAt)}</span>
            </span>
          </Button>
          <Segmented value={days} onChange={setDays} options={[{ value: 7, label: '7 dias' }, { value: 30, label: '30 dias' }, { value: 90, label: '90 dias' }]} />
        </div>
      </div>

      {/* contas */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <button onClick={() => setOnly('')} className={cx('card shrink-0 px-4 py-3 text-left', !only && 'border-violet/50 bg-s2')}>
          <div className="font-semibold">Todas</div>
          <div className="mono text-sub">{accounts.length} contas</div>
        </button>
        {accounts.map((a) => (
          <button key={a.id} onClick={() => setOnly(only === a.id ? '' : a.id)} className={cx('card flex shrink-0 items-center gap-3 px-3 py-2.5 text-left', only === a.id && 'border-violet/50 bg-s2')}>
            <Avatar account={a} size={34} />
            <div className="min-w-0">
              <div className="max-w-[140px] truncate font-semibold">@{a.handle}</div>
              <div className="mono text-sub">{fmtShort(a.followers)} seguidores</div>
            </div>
            <AccountBadge account={a} />
          </button>
        ))}
      </div>

      {expired.length > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-bad/30 bg-bad/10 px-5 py-4">
          <AlertCircle className="shrink-0 text-bad" />
          <div className="flex-1">
            <div className="font-semibold text-bad">
              Atenção: {expired.map((a) => `@${a.handle}`).join(', ')} {expired.length > 1 ? 'foram desconectadas' : 'foi desconectada'}
            </div>
            <div className="text-base">O Threads pediu login de novo. As publicações dessas contas estão em pausa até reconectar.</div>
          </div>
          <Button kind="danger" icon={<RefreshCw size={14} />} onClick={() => nav.go('accounts')}>
            Reconectar agora
          </Button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map((k) => {
          const diff = k.v != null && k.p != null && k.p !== 0 ? ((k.v - k.p) / Math.abs(k.p)) * 100 : null
          return (
            <div key={k.label} className="card p-4">
              <div className="flex items-center justify-between text-sub">
                {k.label}
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-s2">{k.icon}</span>
              </div>
              <div className="mt-2 text-[30px] font-bold leading-9 tabular">{k.v == null ? '—' : `${k.signed && k.v > 0 ? '+' : ''}${fmtNum(k.v)}`}</div>
              <div className="mono mt-1 text-sub">
                {diff == null ? (
                  'sem período anterior'
                ) : (
                  <span className={diff >= 0 ? 'text-ok' : 'text-bad'}>
                    {diff >= 0 ? <ArrowUp size={11} className="inline" /> : <ArrowDown size={11} className="inline" />}
                    {Math.abs(diff).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                  </span>
                )}{' '}
                {diff != null && <span className="font-sans">vs período anterior</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-4">
        <div className="card p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{metric === 'views' ? 'Visualizações' : 'Engajamento'} por dia de publicação</h2>
              <p className="text-base text-sub">Soma das publicações feitas em cada dia, por conta.</p>
            </div>
            <Segmented value={metric} onChange={setMetric} options={[{ value: 'views', label: 'Visualizações' }, { value: 'eng', label: 'Engajamento' }]} />
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            {accs.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-s2 px-2 py-1 text-sm">
                <input type="checkbox" checked={!hidden.includes(a.id)} onChange={() => setHidden((h) => (h.includes(a.id) ? h.filter((x) => x !== a.id) : [...h, a.id]))} />
                <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />@{a.handle}
              </label>
            ))}
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <defs>
                  {accs.map((a) => (
                    <linearGradient key={a.id} id={`g-${a.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={a.color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={a.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="#64748B" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
                <YAxis stroke="#64748B" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtShort(v)} />
                <Tooltip
                  contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#F8FAFC', fontWeight: 600 }}
                  formatter={(v: number, k: string) => [fmtNum(v), '@' + (accMap.get(k)?.handle ?? k)]}
                />
                {accs
                  .filter((a) => !hidden.includes(a.id))
                  .map((a) => (
                    <Area key={a.id} type="monotone" dataKey={a.id} stroke={a.color} strokeWidth={2} fill={`url(#g-${a.id})`} />
                  ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {!cur.some((p) => p.metrics) && <div className="mono mt-2 text-center text-sub">As métricas aparecem algumas horas depois das primeiras publicações (ou clique em "Atualizar métricas").</div>}
        </div>

        <div className="card flex flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              Próximas publicações <span className="mono rounded bg-s2 px-1.5 text-sub">{upcoming.length}</span>
            </h2>
            <button className="flex items-center text-sm text-violet-soft hover:underline" onClick={() => nav.go('posts', { filter: 'scheduled' })}>
              Ver todas <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex-1 space-y-2">
            {upcoming.length ? (
              upcoming.map((p) => (
                <button key={p.id} onClick={() => nav.go('compose', { editId: p.id })} className="w-full rounded-lg border border-s2 bg-canvas/50 p-3 text-left hover:border-s3">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      <b className="text-violet-soft">{relDay(p.scheduledAt!)} {fmtTime(p.scheduledAt!)}</b>
                      <span className="text-sub"> · @{accMap.get(p.accountId)?.handle}</span>
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-2">{p.text || '(só mídia)'}</div>
                </button>
              ))
            ) : (
              <div className="py-8 text-center text-sub">Nada agendado.</div>
            )}
          </div>
          <Button className="mt-3 w-full" icon={<PlusCircle size={15} />} onClick={() => nav.go('compose')}>
            Agendar nova publicação
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_440px] gap-4 pb-6">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Desempenho por conta</h2>
            <span className="text-sub">Últimos {days} dias</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="kicker text-left">
                <th className="py-2 font-medium">Conta</th>
                <th className="py-2 text-right font-medium">Seguidores</th>
                <th className="py-2 text-right font-medium">Posts</th>
                <th className="py-2 text-right font-medium">Visualizações</th>
                <th className="py-2 text-right font-medium">Engaj. médio</th>
                <th className="py-2 pl-4 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {accs.map((a) => (
                <AccountRow key={a.id} a={a} list={cur.filter((p) => p.accountId === a.id)} nav={nav} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Top publicações</h2>
            <Segmented value={topBy} onChange={setTopBy} options={[{ value: 'views', label: 'Mais vistas' }, { value: 'eng', label: 'Engajadas' }]} />
          </div>
          <div className="space-y-2">
            {top.length ? (
              top.map((p) => (
                <div key={p.id} className="rounded-lg border border-s2 bg-canvas/50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      <b className="text-violet-soft">@{accMap.get(p.accountId)?.handle}</b>
                      <span className="mono text-sub"> {relDay(p.publishedAt!)} · {fmtTime(p.publishedAt!)}</span>
                    </span>
                    {p.url && (
                      <button className="flex items-center gap-1 text-violet-soft hover:underline" onClick={() => api.openExternal(p.url!)}>
                        Abrir <ExternalLink size={12} />
                      </button>
                    )}
                  </div>
                  <div className="mt-1 line-clamp-2">{p.text || '(só mídia)'}</div>
                  <div className="mono mt-2 flex gap-4 text-sub">
                    <span><Eye size={12} className="mr-1 inline" />{fmtShort(p.metrics?.views)}</span>
                    <span><Heart size={12} className="mr-1 inline" />{fmtShort(p.metrics?.likes)}</span>
                    <span><MessageSquare size={12} className="mr-1 inline" />{fmtShort(p.metrics?.replies)}</span>
                    <span><Repeat2 size={12} className="mr-1 inline" />{fmtShort(p.metrics?.reposts)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-sub">Nenhuma publicação no período.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AccountRow({ a, list, nav }: { a: Account; list: Post[]; nav: Nav }) {
  const views = list.reduce((s, p) => s + (p.metrics?.views ?? 0), 0)
  const withViews = list.filter((p) => p.metrics?.views)
  const engRate = withViews.length
    ? (withViews.reduce((s, p) => s + (p.metrics!.likes + p.metrics!.replies + p.metrics!.reposts) / p.metrics!.views!, 0) / withViews.length) * 100
    : null
  return (
    <tr className="border-t border-s2">
      <td className="py-2.5">
        <div className="flex items-center gap-2">
          <Avatar account={a} size={28} />
          <span className="font-medium">@{a.handle}</span>
        </div>
      </td>
      <td className="mono py-2.5 text-right">{fmtShort(a.followers)}</td>
      <td className="mono py-2.5 text-right">{list.length}</td>
      <td className="mono py-2.5 text-right">{fmtShort(views)}</td>
      <td className="py-2.5 text-right">
        {engRate == null ? (
          <span className="mono text-sub">—</span>
        ) : (
          <span className={cx('mono rounded px-1.5 py-0.5', engRate >= 3 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn')}>{engRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
        )}
      </td>
      <td className="py-2.5 pl-4">
        <AccountBadge account={a} />
      </td>
      <td className="py-2.5 text-right">
        {a.status === 'expired' ? (
          <button className="text-sm text-bad hover:underline" onClick={() => nav.go('accounts')}>Reconectar</button>
        ) : (
          <button className="text-sm text-violet-soft hover:underline" onClick={() => nav.go('posts', { accountId: a.id })}>Ver posts</button>
        )}
      </td>
    </tr>
  )
}
