import { ReactNode, useEffect, useState } from 'react'
import { User, SlidersHorizontal, ShieldCheck, Bell, Rocket, Database, Info, FolderOpen, Download, Upload, Trash2, AlertCircle, Monitor } from 'lucide-react'
import type { AppState, Settings } from '@shared/types'
import { api } from '../api'
import { Badge, Button, Toggle, useRun, useToast } from '../ui'
import { cx, initials } from '../util'
import { Logo } from '../App'

const SECTIONS = [
  { id: 'perfil', label: 'Perfil local', icon: User },
  { id: 'geral', label: 'Geral', icon: SlidersHorizontal },
  { id: 'verificacao', label: 'Verificação de contas', icon: ShieldCheck },
  { id: 'notificacoes', label: 'Notificações', icon: Bell },
  { id: 'publicacao', label: 'Publicação e fila', icon: Rocket },
  { id: 'dados', label: 'Dados e armazenamento', icon: Database },
  { id: 'sobre', label: 'Sobre o ThreadFlow', icon: Info }
]

export default function SettingsPage({ state }: { state: AppState }) {
  const s = state.settings
  const run = useRun()
  const toast = useToast()
  const set = (patch: Partial<Settings>) => run(() => api.updateSettings(patch))
  const [name, setName] = useState(s.userName)
  const [role, setRole] = useState(s.userRole)
  const [active, setActive] = useState('perfil')

  useEffect(() => {
    const t = setTimeout(() => {
      if (name !== s.userName || role !== s.userRole) set({ userName: name, userRole: role })
    }, 500)
    return () => clearTimeout(t)
  }, [name, role])

  const go = (id: string) => {
    setActive(id)
    document.getElementById('sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="grid grid-cols-[230px_1fr] gap-6">
      <aside>
        <div className="card sticky top-0 p-3">
          <div className="kicker mb-2 flex justify-between px-2">
            Ajustes do app <span className="normal-case">v{state.runtime.version}</span>
          </div>
          {SECTIONS.map((x) => {
            const Icon = x.icon
            return (
              <button key={x.id} onClick={() => go(x.id)} className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-md', active === x.id ? 'bg-violet/20 text-white' : 'text-sub hover:bg-s2 hover:text-white')}>
                <Icon size={15} /> {x.label}
              </button>
            )
          })}
        </div>
      </aside>

      <div className="max-w-3xl space-y-4 pb-10">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-md text-sub">As alterações são salvas automaticamente.</p>
        </div>

        <Card id="perfil" icon={<User size={17} />} title="Perfil local" tag="Só neste computador">
          <div className="mb-4 flex items-center gap-3 rounded-lg bg-canvas/60 p-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet to-violet-dark text-md font-bold">{initials(name)}</span>
            <div>
              <div className="font-semibold">{name || 'Você'}</div>
              <div className="text-sub">
                {role} · {state.accounts.length} conta(s)
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nome de exibição</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Cargo ou função</label>
              <input className="input" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card id="geral" icon={<SlidersHorizontal size={17} />} title="Geral">
          <Row title="Iniciar com o Windows" desc="Abre o ThreadFlow minimizado ao ligar o computador, para os agendamentos continuarem.">
            <Toggle checked={s.autostart} onChange={(v) => set({ autostart: v })} />
          </Row>
          <Row title="Impedir suspensão com publicações próximas" desc="Evita que o computador entre em suspensão quando há publicações nas próximas 2 horas. A tela ainda pode desligar.">
            <Toggle checked={s.preventSleep} onChange={(v) => set({ preventSleep: v })} />
          </Row>
          <Row title="Horários perdidos" desc="O que fazer com publicações cujo horário passou enquanto o computador estava desligado.">
            <select className="input w-72" value={s.missedPolicy} onChange={(e) => set({ missedPolicy: e.target.value as Settings['missedPolicy'] })}>
              <option value="publish">Publicar assim que abrir</option>
              <option value="skip">Não publicar (marcar como falha)</option>
            </select>
          </Row>
          <div className="mono mt-2 text-sub">Fuso horário: {Intl.DateTimeFormat().resolvedOptions().timeZone} (do Windows)</div>
        </Card>

        <Card id="verificacao" icon={<ShieldCheck size={17} />} title="Verificação de contas e métricas">
          <p className="mb-3 text-base text-sub">Com que frequência o app abre o Threads em segundo plano para checar se as sessões continuam ativas.</p>
          <Choice
            value={s.checkIntervalMin}
            onChange={(v) => set({ checkIntervalMin: v })}
            options={[
              { v: 15, l: '15 minutos', h: 'Alta frequência' },
              { v: 30, l: '30 minutos', h: 'Recomendado' },
              { v: 60, l: '1 hora', h: 'Econômico' },
              { v: 0, l: 'Manual', h: 'Sob demanda' }
            ]}
          />
          <p className="mb-3 mt-5 text-base text-sub">Atualização das métricas (visualizações, curtidas, respostas, reposts e seguidores) dos posts dos últimos 30 dias.</p>
          <Choice
            value={s.metricsIntervalMin}
            onChange={(v) => set({ metricsIntervalMin: v })}
            options={[
              { v: 60, l: '1 hora', h: 'Mais atual' },
              { v: 120, l: '2 horas', h: 'Recomendado' },
              { v: 360, l: '6 horas', h: 'Econômico' },
              { v: 0, l: 'Manual', h: 'Sob demanda' }
            ]}
          />
        </Card>

        <Card id="notificacoes" icon={<Bell size={17} />} title="Notificações do Windows">
          <Row title="Falha na publicação" desc="Avisa na hora, com atalho para o diagnóstico.">
            <Toggle checked={s.notifyFailure} onChange={(v) => set({ notifyFailure: v })} />
          </Row>
          <Row title="Conta desconectada" desc="Avisa quando o Threads pedir login de novo.">
            <Toggle checked={s.notifyDisconnected} onChange={(v) => set({ notifyDisconnected: v })} />
          </Row>
          <Row title="Publicação concluída" desc="Aviso discreto quando um post entra no ar.">
            <Toggle checked={s.notifySuccess} onChange={(v) => set({ notifySuccess: v })} />
          </Row>
          <Row title="Som nas notificações">
            <Toggle checked={s.notifySound} onChange={(v) => set({ notifySound: v })} />
          </Row>
        </Card>

        <Card id="publicacao" icon={<Rocket size={17} />} title="Publicação e fila">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Contas publicando ao mesmo tempo</label>
              <select className="input" value={s.maxConcurrent} onChange={(e) => set({ maxConcurrent: Number(e.target.value) })}>
                <option value={0}>Automático ({state.runtime.concurrency} neste PC)</option>
                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-sub">Cada conta usa cerca de 200 MB de memória enquanto publica.</p>
            </div>
            <div>
              <label className="label">Tentativas automáticas em caso de falha</label>
              <select className="input" value={s.retries} onChange={(e) => set({ retries: Number(e.target.value) })}>
                <option value={0}>Nenhuma</option>
                <option value={1}>1 tentativa (após 1 min)</option>
                <option value={2}>2 tentativas (1 min, 5 min)</option>
                <option value={3}>3 tentativas (1 min, 5 min, 15 min)</option>
                <option value={5}>5 tentativas (até 1 h)</option>
              </select>
            </div>
            <div>
              <label className="label">Intervalo entre posts da mesma conta</label>
              <select className="input" value={s.sameAccountGapSec} onChange={(e) => set({ sameAccountGapSec: Number(e.target.value) })}>
                <option value={0}>Sem intervalo</option>
                <option value={20}>20 segundos (recomendado)</option>
                <option value={60}>1 minuto</option>
                <option value={300}>5 minutos</option>
              </select>
              <p className="mt-1 text-sm text-sub">Quando uma conta tem vários posts no mesmo horário, eles saem em sequência com esse espaço, para não parecer spam.</p>
            </div>
            <div>
              <label className="label">Preparar com antecedência</label>
              <select className="input" value={s.prepareSeconds} onChange={(e) => set({ prepareSeconds: Number(e.target.value) })}>
                <option value={30}>30 segundos</option>
                <option value={60}>1 minuto</option>
                <option value={90}>1 min 30 s (recomendado)</option>
                <option value={180}>3 minutos</option>
              </select>
              <p className="mt-1 text-sm text-sub">O app abre o Threads, escreve o texto e anexa as mídias antes. No horário exato, só clica em Publicar.</p>
            </div>
          </div>
          <div className="mt-4">
            <Row title="Tentar de novo em falhas temporárias" desc="Internet instável, Threads lento ou tela inesperada.">
              <Toggle checked={s.retryTransient} onChange={(v) => set({ retryTransient: v })} />
            </Row>
            <Row title="Pausar a fila da conta se uma publicação falhar de vez" desc="Evita várias falhas seguidas na mesma conta.">
              <Toggle checked={s.pauseAccountOnError} onChange={(v) => set({ pauseAccountOnError: v })} />
            </Row>
            <Row title="Modo leve" desc="Não baixa fotos, vídeos e fontes do feed enquanto publica. Usa menos memória e internet; suas mídias são enviadas normalmente.">
              <Toggle checked={s.lightMode} onChange={(v) => set({ lightMode: v })} />
            </Row>
            <Row title="Mostrar navegador durante publicações" desc="Para acompanhar ou investigar problemas. Normalmente fica desligado (tudo acontece em segundo plano).">
              <Toggle checked={s.showBrowser} onChange={(v) => set({ showBrowser: v })} />
            </Row>
          </div>
        </Card>

        <Card id="dados" icon={<Database size={17} />} title="Dados e armazenamento">
          <Row title="Backup" desc="Cópia das contas, publicações, métricas e logs. As sessões de login não vão no backup; em outro computador, reconecte as contas.">
            <div className="flex gap-2">
              <Button size="sm" icon={<Upload size={13} />} onClick={() => run(() => api.restoreBackup().then((ok) => ok && toast('ok', 'Backup restaurado')))}>
                Restaurar
              </Button>
              <Button kind="soft" size="sm" icon={<Download size={13} />} onClick={() => run(() => api.exportBackup().then((ok) => ok && toast('ok', 'Backup criado')))}>
                Criar backup
              </Button>
            </div>
          </Row>
          <Row title="Pasta de dados" desc={state.runtime.dataDir}>
            <Button size="sm" icon={<FolderOpen size={13} />} onClick={() => api.openDataFolder()}>
              Abrir pasta
            </Button>
          </Row>
          <Row title="Limpeza de logs antigos" desc="Remove registros com mais de 30 dias.">
            <Button kind="danger" size="sm" icon={<Trash2 size={13} />} onClick={() => run(() => api.clearLogs(30).then((n) => toast('ok', `${n} registro(s) removidos`)))}>
              Limpar logs
            </Button>
          </Row>
        </Card>

        <Card id="sobre" icon={<Info size={17} />} title="Sobre o ThreadFlow">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div className="flex-1">
              <div className="font-semibold">ThreadFlow Desktop v{state.runtime.version}</div>
              <div className="text-sub">Agendador local para várias contas do Threads</div>
            </div>
          </div>
          <div className={cx('mt-4 flex items-center gap-3 rounded-lg px-3 py-2.5', state.runtime.browserFound ? 'bg-canvas/60' : 'border border-bad/30 bg-bad/10')}>
            {state.runtime.browserFound ? <Monitor size={16} className="text-ok" /> : <AlertCircle size={16} className="text-bad" />}
            <span className="flex-1">
              {state.runtime.browserFound ? `Publicando pelo ${state.runtime.browserName}.` : 'Microsoft Edge ou Google Chrome não encontrado. Instale um deles.'}
            </span>
            {!state.runtime.browserFound && (
              <Button size="sm" onClick={() => run(() => api.redetectBrowser())}>
                Procurar de novo
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Card({ id, icon, title, tag, children }: { id: string; icon: ReactNode; title: string; tag?: string; children: ReactNode }) {
  return (
    <section id={'sec-' + id} className="card scroll-mt-4 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="text-violet-soft">{icon}</span>
          {title}
        </h2>
        {tag && <Badge>{tag}</Badge>}
      </div>
      {children}
    </section>
  )
}

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-t border-s2 py-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        {desc && <div className="break-words text-sm text-sub">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Choice({ value, options, onChange }: { value: number; options: { v: number; l: string; h: string }[]; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={cx('rounded-lg border px-3 py-2.5 text-left', value === o.v ? 'border-violet bg-violet/15' : 'border-s2 bg-canvas/60 hover:border-s3')}>
          <div className="font-medium">{o.l}</div>
          <div className="mono text-sub">{o.h}</div>
        </button>
      ))}
    </div>
  )
}
