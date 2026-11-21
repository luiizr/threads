import { useEffect, useState } from 'react'
import { BarChart3, Users, CalendarPlus, Layers, Terminal, Settings as Cog, Plus, Infinity as Loop, AlertTriangle } from 'lucide-react'
import { useAppState, api } from './api'
import { Avatar, Button, Dot } from './ui'
import { cx, initials, ago } from './util'
import Metrics from './pages/Metrics'
import Accounts from './pages/Accounts'
import Compose from './pages/Compose'
import Posts from './pages/Posts'
import Logs from './pages/Logs'
import SettingsPage from './pages/Settings'
import Welcome from './pages/Welcome'

export type Page = 'metrics' | 'accounts' | 'compose' | 'posts' | 'logs' | 'settings'
export interface Nav {
  go: (p: Page, opts?: { editId?: string; accountId?: string; logId?: string; filter?: string }) => void
  opts: { editId?: string; accountId?: string; logId?: string; filter?: string }
}

const NAV: { id: Page; label: string; icon: typeof BarChart3 }[] = [
  { id: 'metrics', label: 'Métricas', icon: BarChart3 },
  { id: 'accounts', label: 'Contas', icon: Users },
  { id: 'compose', label: 'Agendar', icon: CalendarPlus },
  { id: 'posts', label: 'Publicações', icon: Layers },
  { id: 'logs', label: 'Logs', icon: Terminal },
  { id: 'settings', label: 'Configurações', icon: Cog }
]

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="flex items-center justify-center rounded-lg bg-gradient-to-br from-violet to-violet-dark text-white shadow-glow" style={{ width: size, height: size }}>
      <Loop size={size * 0.6} strokeWidth={2.4} />
    </span>
  )
}

export default function App() {
  const state = useAppState()
  const [page, setPage] = useState<Page>('metrics')
  const [opts, setOpts] = useState<Nav['opts']>({})
  const nav: Nav = {
    go: (p, o = {}) => {
      setOpts(o)
      setPage(p)
    },
    opts
  }

  useEffect(() => window.tf.on('navigate', (p: string) => nav.go(p as Page)), [])

  if (!state) return <div className="flex h-full items-center justify-center text-sub">Carregando…</div>
  if (!state.settings.onboarded) return <Welcome state={state} />

  const { accounts, posts, settings, runtime } = state
  const scheduled = posts.filter((p) => p.status === 'scheduled').length
  const publishing = posts.filter((p) => p.status === 'publishing').length
  const expired = accounts.filter((a) => a.status === 'expired').length

  return (
    <div className="flex h-full flex-col">
      {/* barra de título */}
      <header className="drag flex h-10 shrink-0 items-center gap-3 border-b border-s2 bg-canvas pl-4 pr-[150px]">
        <div className="flex w-[196px] items-center gap-2">
          <Logo size={22} />
          <span className="font-semibold">ThreadFlow</span>
          <span className="mono text-mute">v{runtime.version}</span>
        </div>
        <div className="no-drag flex items-center gap-2">
          <button onClick={() => nav.go('accounts')} className="flex items-center gap-2 rounded-full border border-s2 bg-s1 py-0.5 pl-0.5 pr-3 hover:border-s3">
            <span className="flex -space-x-1.5">
              {accounts.slice(0, 3).map((a) => (
                <span key={a.id} className="rounded-full ring-2 ring-s1">
                  <Avatar account={a} size={20} ring={false} />
                </span>
              ))}
              {!accounts.length && <span className="h-5 w-5 rounded-full bg-s2" />}
            </span>
            <span className="text-sm">{accounts.length} conta(s)</span>
          </button>
          <span className="mono flex items-center gap-1.5 rounded-full bg-s1 px-2.5 py-1 text-sub">
            {publishing ? <Dot tone="violet" pulse /> : <Dot tone="ok" />}
            {publishing ? `Publicando ${publishing}` : `Agendador ativo · ${scheduled} na fila`}
          </span>
          {expired > 0 && (
            <button onClick={() => nav.go('accounts')} className="mono flex items-center gap-1.5 rounded-full bg-bad/10 px-2.5 py-1 text-bad">
              <AlertTriangle size={12} /> {expired} desconectada(s)
            </button>
          )}
          {!runtime.browserFound && (
            <span className="mono flex items-center gap-1.5 rounded-full bg-bad/10 px-2.5 py-1 text-bad">
              <AlertTriangle size={12} /> Edge/Chrome não encontrado
            </span>
          )}
        </div>
        <div className="flex-1" />
        <div className="no-drag">
          <Button kind="primary" size="sm" icon={<Plus size={14} />} onClick={() => nav.go('compose')}>
            Nova publicação
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* menu lateral */}
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-s2 bg-canvas p-3">
          <nav className="flex flex-col gap-0.5">
            {NAV.map((n) => {
              const Icon = n.icon
              const active = page === n.id
              return (
                <button
                  key={n.id}
                  onClick={() => nav.go(n.id)}
                  className={cx(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-md transition',
                    active ? 'bg-violet/15 text-white ring-1 ring-violet/30' : 'text-sub hover:bg-s1 hover:text-white'
                  )}
                >
                  <Icon size={17} className={active ? 'text-violet-soft' : ''} />
                  {n.label}
                  {n.id === 'accounts' && expired > 0 && <span className="ml-auto rounded-full bg-bad px-1.5 text-xs2 font-bold text-white">{expired}</span>}
                  {n.id === 'posts' && publishing > 0 && <span className="ml-auto"><Dot tone="violet" pulse /></span>}
                </button>
              )
            })}
          </nav>
          <div className="flex-1" />
          <div className="mb-2 rounded-lg border border-s2 bg-s1 px-3 py-2">
            <div className="kicker">Última checagem</div>
            <div className="mono mt-0.5 text-sub">Contas: {ago(runtime.lastCheckAt)}</div>
            <div className="mono text-sub">Métricas: {ago(runtime.lastMetricsAt)}</div>
          </div>
          <button onClick={() => nav.go('settings')} className="flex items-center gap-3 rounded-lg border border-s2 bg-s1 p-2.5 text-left hover:border-s3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-violet-dark text-sm font-bold">
              {initials(settings.userName)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{settings.userName || 'Você'}</span>
              <span className="block truncate text-sm text-sub">{settings.userRole}</span>
            </span>
          </button>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto bg-[#0E1320] px-7 py-6">
          {page === 'metrics' && <Metrics state={state} nav={nav} />}
          {page === 'accounts' && <Accounts state={state} nav={nav} />}
          {page === 'compose' && <Compose key={opts.editId ?? 'new'} state={state} nav={nav} />}
          {page === 'posts' && <Posts state={state} nav={nav} />}
          {page === 'logs' && <Logs state={state} nav={nav} />}
          {page === 'settings' && <SettingsPage state={state} />}
        </main>
      </div>
    </div>
  )
}

export { api }
