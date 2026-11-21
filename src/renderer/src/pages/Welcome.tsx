import { useState } from 'react'
import { ArrowRight, BadgeCheck, HardDrive, LogIn, Zap, Lock, CheckCircle2, Monitor } from 'lucide-react'
import type { AppState } from '@shared/types'
import { api } from '../api'
import { Avatar, Button, useRun } from '../ui'
import { cx, initials } from '../util'
import { Logo } from '../App'

export default function Welcome({ state }: { state: AppState }) {
  const [step, setStep] = useState(state.settings.userName ? 2 : 1)
  const [name, setName] = useState(state.settings.userName)
  const run = useRun()
  const connecting = state.runtime.connecting

  const steps = [
    { n: 1, t: 'Seu perfil', s: 'Nome de exibição' },
    { n: 2, t: 'Conectar contas', s: 'Login no Threads' },
    { n: 3, t: 'Agendador', s: 'Fila e automação' }
  ]

  return (
    <div className="flex h-full flex-col">
      <header className="drag h-10 shrink-0 bg-canvas" />
      <div className="flex-1 overflow-auto bg-[#0E1320] px-6 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-s2 bg-canvas">
          <div className="flex items-center justify-between border-b border-s2 px-6 py-4">
            <div className="flex items-center gap-3">
              <Logo size={40} />
              <span className="text-xl font-bold">ThreadFlow</span>
              <span className="mono rounded bg-s2 px-1.5 py-0.5 text-sub">v{state.runtime.version}</span>
            </div>
            <span className="mono flex items-center gap-1.5 text-sub">
              <Lock size={13} /> Tudo fica salvo neste computador
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 px-6 pt-5">
            {steps.map((s) => (
              <div key={s.n} className={cx('flex items-center gap-3 rounded-xl border px-4 py-3', step === s.n ? 'border-violet/40 bg-s2' : 'border-s2 bg-s1', step < s.n && 'opacity-60')}>
                <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold', step > s.n ? 'bg-ok text-black' : step === s.n ? 'bg-violet-soft text-violet-deep' : 'bg-s3')}>
                  {step > s.n ? <CheckCircle2 size={15} /> : s.n}
                </span>
                <span>
                  <span className="block font-semibold">{s.t}</span>
                  <span className="mono block text-sub">{s.s}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="px-6 py-7">
            {step === 1 && (
              <>
                <div className="kicker mb-2 flex items-center gap-1.5 text-violet-soft">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-soft" /> Primeiro passo
                </div>
                <h1 className="text-2xl font-bold">Bem-vindo ao ThreadFlow</h1>
                <p className="mt-2 max-w-2xl text-md text-sub">Não precisa criar conta nem informar e-mail. Como podemos chamar você?</p>
                <div className="mt-6 flex gap-5 rounded-xl border border-s2 bg-s1 p-5">
                  <div className="flex w-40 flex-col items-center gap-2 rounded-xl bg-canvas p-4">
                    <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet to-violet-dark text-xl font-bold">{initials(name)}</span>
                    <span className="font-medium">{name || 'Seu nome'}</span>
                  </div>
                  <form
                    className="flex flex-1 flex-col justify-center gap-4"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!name.trim()) return
                      await run(() => api.updateSettings({ userName: name.trim() }))
                      setStep(2)
                    }}
                  >
                    <div>
                      <label className="label">Seu nome ou apelido</label>
                      <input className="input h-11 text-md" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Luiz" />
                    </div>
                    <div className="flex justify-end">
                      <Button kind="primary" size="lg" disabled={!name.trim()} type="submit">
                        Continuar <ArrowRight size={16} />
                      </Button>
                    </div>
                  </form>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="kicker mb-2 flex items-center gap-1.5 text-violet-soft">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-soft" /> Conectar contas
                </div>
                <h1 className="text-2xl font-bold">Conecte suas contas do Threads</h1>
                <p className="mt-2 max-w-2xl text-md text-sub">
                  Vai abrir uma janela do navegador com a página de login do Threads. Entre na conta normalmente. Quando terminar, a janela fecha sozinha e a conta aparece aqui. Repita para cada conta.
                </p>
                <div className="mt-6 rounded-xl border border-s2 bg-s1 p-5">
                  <div className="flex items-center gap-4">
                    <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-canvas text-violet-soft">
                      <LogIn size={26} />
                    </span>
                    <div className="flex-1">
                      <div className="text-md font-semibold">Login direto no Threads</div>
                      <div className="text-base text-sub">Sua senha é digitada só no site do Threads. O ThreadFlow guarda apenas a sessão, criptografada pelo Windows.</div>
                    </div>
                    <Button kind="primary" size="lg" loading={connecting} onClick={() => run(async () => { const r = await api.connectAccount(); if (!r.ok) throw new Error(r.error) }, 'Conta conectada!')}>
                      {connecting ? 'Aguardando login…' : state.accounts.length ? 'Conectar outra conta' : 'Conectar conta'}
                    </Button>
                  </div>
                  {connecting && (
                    <div className="mt-4 flex items-center justify-between rounded-lg bg-canvas px-4 py-3 text-base text-sub">
                      Faça o login na janela que abriu. Fechar a janela cancela.
                      <button className="text-violet-soft underline" onClick={() => api.cancelConnect()}>Cancelar</button>
                    </div>
                  )}
                  {state.accounts.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {state.accounts.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-2.5">
                          <Avatar account={a} size={32} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{a.name}</div>
                            <div className="mono text-sub">@{a.handle}</div>
                          </div>
                          <CheckCircle2 size={16} className="text-ok" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {!state.runtime.browserFound && (
                  <div className="mt-4 rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-base text-bad">
                    Não encontramos o Microsoft Edge nem o Google Chrome neste computador. Instale um deles para usar o ThreadFlow.
                  </div>
                )}
                <div className="mt-5 flex justify-between">
                  <button className="text-base text-sub underline hover:text-white" onClick={() => setStep(3)}>
                    Fazer isso depois
                  </button>
                  <Button kind="secondary" size="lg" onClick={() => setStep(3)} disabled={connecting}>
                    Continuar <ArrowRight size={16} />
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="text-2xl font-bold">Tudo pronto, {state.settings.userName || 'pessoal'}!</h1>
                <p className="mt-2 max-w-2xl text-md text-sub">
                  O ThreadFlow abre junto com o Windows e fica no ícone perto do relógio. Fechar a janela não desliga o agendador. As publicações saem no horário, desde que o computador esteja ligado.
                </p>
                <div className="mt-6 flex justify-end">
                  <Button kind="primary" size="lg" onClick={() => run(() => api.updateSettings({ onboarded: true }))}>
                    Abrir o painel <ArrowRight size={16} />
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-s2 px-6 py-5">
            {[
              { i: <HardDrive size={16} />, t: '100% local', s: 'Contas, posts e métricas ficam salvos só neste computador.' },
              { i: <Zap size={16} />, t: 'Várias contas ao mesmo tempo', s: 'Posts no mesmo horário saem em paralelo.' },
              { i: <Monitor size={16} />, t: 'Roda em segundo plano', s: 'Inicia com o Windows e publica sozinho.' }
            ].map((f) => (
              <div key={f.t} className="flex gap-3 rounded-xl bg-s1 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-s2 text-violet-soft">{f.i}</span>
                <span>
                  <span className="block font-semibold">{f.t}</span>
                  <span className="block text-base text-sub">{f.s}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="mono mt-4 text-center text-mute">
          <BadgeCheck size={12} className="mr-1 inline" />
          Usa o {state.runtime.browserName ?? 'navegador'} instalado no Windows para publicar
        </p>
      </div>
    </div>
  )
}
