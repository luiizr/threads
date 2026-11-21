import { useMemo, useState } from 'react'
import { PlusCircle, RefreshCw, Search, LineChart, CloudOff, Pause, Play, Info, ShieldCheck, Users } from 'lucide-react'
import type { Account, AppState } from '@shared/types'
import { api } from '../api'
import { AccountBadge, Avatar, Button, Empty, Modal, PageHeader, Toggle, useRun } from '../ui'
import { ago, cx, dayKey, fmtShort, fmtWhen } from '../util'
import type { Nav } from '../App'

type Filter = 'all' | 'ok' | 'attention'

export default function Accounts({ state, nav }: { state: AppState; nav: Nav }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [manage, setManage] = useState<Account | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)
  const run = useRun()
  const { accounts, posts, runtime } = state

  const needs = (a: Account) => a.status === 'expired' || a.status === 'error' || a.paused
  const list = accounts.filter(
    (a) =>
      (filter === 'all' || (filter === 'ok' ? !needs(a) : needs(a))) &&
      (!q || `${a.name} ${a.handle}`.toLowerCase().includes(q.toLowerCase().replace(/^@/, '')))
  )

  const today = dayKey(Date.now())
  const perAccount = useMemo(() => {
    const m = new Map<string, { today: number; pending: number; next?: number }>()
    for (const a of accounts) m.set(a.id, { today: 0, pending: 0 })
    for (const p of posts) {
      const r = m.get(p.accountId)
      if (!r) continue
      if (p.status === 'published' && p.publishedAt && dayKey(p.publishedAt) === today) r.today++
      if (p.status === 'scheduled') {
        r.pending++
        if (p.scheduledAt && (!r.next || p.scheduledAt < r.next)) r.next = p.scheduledAt
      }
    }
    return m
  }, [accounts, posts, today])

  const connect = () =>
    run(async () => {
      const r = await api.connectAccount()
      if (!r.ok) throw new Error(r.error)
    }, 'Conta conectada!')

  return (
    <div>
      <PageHeader
        title="Contas conectadas"
        subtitle="Cada conta tem a própria sessão salva neste computador. Se o Threads pedir login de novo, a conta aparece como desconectada e as publicações dela esperam a reconexão."
        actions={
          <>
            <Button
              icon={<RefreshCw size={15} className={checkingAll ? 'animate-spin' : ''} />}
              disabled={checkingAll || !accounts.length}
              onClick={async () => {
                setCheckingAll(true)
                await run(() => api.verifyAll(), 'Verificação concluída')
                setCheckingAll(false)
              }}
            >
              <span className="text-left leading-tight">
                Verificar agora
                <span className="mono block text-mute">Última: {ago(runtime.lastCheckAt)}</span>
              </span>
            </Button>
            <Button kind="primary" size="lg" icon={<PlusCircle size={17} />} loading={runtime.connecting} onClick={connect}>
              {runtime.connecting ? 'Aguardando login…' : 'Conectar nova conta'}
            </Button>
          </>
        }
      />

      {runtime.connecting && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-violet/30 bg-violet/10 px-4 py-3">
          <span>Uma janela do navegador abriu com o login do Threads. Entre na conta lá. A janela fecha sozinha quando terminar.</span>
          <Button size="sm" kind="ghost" onClick={() => api.cancelConnect()}>
            Cancelar
          </Button>
        </div>
      )}

      <div className="card mb-5 flex items-center gap-2 p-2">
        {(
          [
            ['all', 'Todas', accounts.length, null],
            ['ok', 'Conectadas', accounts.filter((a) => !needs(a)).length, 'bg-ok'],
            ['attention', 'Requer atenção', accounts.filter(needs).length, 'bg-warn']
          ] as const
        ).map(([id, label, n, dot]) => (
          <button key={id} onClick={() => setFilter(id)} className={cx('flex items-center gap-2 rounded-lg px-3 py-1.5 text-md', filter === id ? 'bg-s2 text-white' : 'text-sub hover:text-white')}>
            {dot && <span className={cx('h-2 w-2 rounded-full', dot)} />}
            {label}
            <span className="mono rounded bg-s3/60 px-1.5">{n}</span>
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative w-72">
          <Search size={15} className="absolute left-3 top-2.5 text-mute" />
          <input className="input pl-9" placeholder="Filtrar por nome ou @handle…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {!accounts.length ? (
        <div className="card">
          <Empty icon={<Users size={22} />} title="Nenhuma conta conectada" text="Conecte a primeira conta do Threads para começar a agendar." action={<Button kind="primary" onClick={connect}>Conectar conta</Button>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {list.map((a) => {
            const st = perAccount.get(a.id)!
            const bar = a.status === 'expired' ? 'from-bad to-bad/40' : a.status === 'error' || a.paused ? 'from-warn to-warn/40' : 'from-ok to-ok/40'
            return (
              <div key={a.id} className="card overflow-hidden">
                <div className={cx('h-1 bg-gradient-to-r', bar)} />
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar account={a} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-semibold">{a.name}</div>
                      <div className="text-md text-sub">@{a.handle}</div>
                      <div className="mono text-info">{a.followers != null ? `${fmtShort(a.followers)} seguidores` : 'seguidores —'}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <AccountBadge account={a} />
                      <span className="mono text-sub">Última checagem: {ago(a.lastCheckedAt)}</span>
                    </div>
                  </div>

                  {a.status === 'expired' ? (
                    <div className="mt-4 rounded-xl border border-bad/25 bg-bad/10 p-4">
                      <div className="flex items-center gap-2 text-md font-semibold text-bad">
                        <CloudOff size={17} /> A sessão expirou ou foi encerrada
                      </div>
                      <p className="mt-1 text-base text-ink/90">
                        Reconecte para continuar publicando. {st.pending ? <b className="text-bad">{st.pending} publicação(ões)</b> : 'Nenhuma publicação'} {st.pending ? 'aguardando a reconexão.' : 'pendente.'}
                      </p>
                    </div>
                  ) : a.status === 'error' ? (
                    <div className="mt-4 flex gap-2 rounded-xl border border-warn/25 bg-warn/10 p-3 text-base">
                      <Info size={16} className="mt-0.5 shrink-0 text-warn" />
                      <span>A última verificação não respondeu: {a.lastError}. Normalmente é a internet; o app tenta de novo sozinho.</span>
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-canvas/60 p-3">
                    <Mini label="Publicadas hoje" value={String(st.today)} />
                    <Mini label="Na fila" value={String(st.pending)} />
                    <Mini label="Próxima" value={st.next ? fmtWhen(st.next) : '—'} />
                  </div>

                  <div className="mt-4 flex items-center gap-2 border-t border-s2 pt-4">
                    <Button kind="ghost" icon={<LineChart size={15} />} onClick={() => nav.go('metrics', { accountId: a.id })}>
                      Ver métricas
                    </Button>
                    <div className="flex-1" />
                    {a.status === 'expired' ? (
                      <Button kind="danger" icon={<RefreshCw size={15} />} loading={runtime.connecting} onClick={() => run(async () => { const r = await api.reconnectAccount(a.id); if (!r.ok) throw new Error(r.error) }, 'Conta reconectada!')}>
                        Reconectar agora
                      </Button>
                    ) : (
                      <Button kind="ghost" icon={a.paused ? <Play size={15} /> : <Pause size={15} />} onClick={() => run(() => api.updateAccount(a.id, { paused: !a.paused }))}>
                        {a.paused ? 'Retomar fila' : 'Pausar fila'}
                      </Button>
                    )}
                    <Button onClick={() => setManage(a)}>Gerenciar</Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="card mt-5 flex items-center gap-3 px-5 py-4">
        <ShieldCheck size={20} className="text-sub" />
        <div className="flex-1">
          <div className="font-semibold">Sessões guardadas com segurança</div>
          <div className="text-base text-sub">O ThreadFlow nunca vê sua senha. A sessão de cada conta é criptografada pelo Windows e só abre neste usuário do computador.</div>
        </div>
        <span className="mono text-sub">Navegador: {runtime.browserName ?? 'não encontrado'}</span>
      </div>

      {manage && <ManageModal account={state.accounts.find((x) => x.id === manage.id) ?? manage} onClose={() => setManage(null)} pending={perAccount.get(manage.id)?.pending ?? 0} connecting={runtime.connecting} />}
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-sub">{label}</div>
      <div className="mono mt-0.5 text-base text-ink">{value}</div>
    </div>
  )
}

function ManageModal({ account, onClose, pending, connecting }: { account: Account; onClose: () => void; pending: number; connecting: boolean }) {
  const [handle, setHandle] = useState(account.handle)
  const [name, setName] = useState(account.name)
  const [confirm, setConfirm] = useState(false)
  const [delPosts, setDelPosts] = useState(false)
  const run = useRun()
  return (
    <Modal open onClose={onClose} title={`Gerenciar @${account.handle}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">@ da conta</label>
            <input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <div>
            <label className="label">Nome exibido</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <p className="text-sm text-sub">O @ precisa ser igual ao do Threads: é usado para achar o link e as métricas das publicações.</p>
        <div className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2.5">
          <span>
            <span className="block font-medium">Pausar fila desta conta</span>
            <span className="text-sm text-sub">As publicações ficam guardadas e saem quando retomar.</span>
          </span>
          <Toggle checked={account.paused} onChange={(v) => run(() => api.updateAccount(account.id, { paused: v }))} />
        </div>
        <div className="flex gap-2">
          <Button icon={<RefreshCw size={14} />} onClick={() => run(() => api.verifyAccount(account.id).then((ok) => { if (!ok) throw new Error('A sessão não está ativa.') }), 'Sessão ativa')}>
            Verificar sessão
          </Button>
          <Button loading={connecting} onClick={() => run(async () => { const r = await api.reconnectAccount(account.id); if (!r.ok) throw new Error(r.error) }, 'Conta reconectada!')}>
            Fazer login de novo
          </Button>
        </div>
        <div className="flex items-center justify-between border-t border-s3 pt-4">
          {!confirm ? (
            <Button kind="danger" onClick={() => setConfirm(true)}>
              Remover conta
            </Button>
          ) : (
            <div className="flex-1 rounded-lg border border-bad/30 bg-bad/10 p-3">
              <div className="font-medium text-bad">Remover @{account.handle} do ThreadFlow?</div>
              <div className="mt-1 text-sm">A sessão salva é apagada e {pending} publicação(ões) pendente(s) desta conta são excluídas. A conta no Threads não é afetada.</div>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={delPosts} onChange={(e) => setDelPosts(e.target.checked)} /> Apagar também o histórico de publicações e métricas
              </label>
              <div className="mt-3 flex gap-2">
                <Button kind="danger" onClick={() => run(() => api.removeAccount(account.id, delPosts), 'Conta removida').then(onClose)}>
                  Sim, remover
                </Button>
                <Button kind="ghost" onClick={() => setConfirm(false)}>
                  Voltar
                </Button>
              </div>
            </div>
          )}
          {!confirm && (
            <Button kind="primary" onClick={() => run(() => api.updateAccount(account.id, { handle, name }), 'Salvo').then(onClose)}>
              Salvar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
