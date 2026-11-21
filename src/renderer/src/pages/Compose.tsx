import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, X, Film, Send, CalendarClock, Save, Heart, MessageCircle, Repeat2, Share, AlertTriangle, Check, Zap } from 'lucide-react'
import type { AppState, PickedFile } from '@shared/types'
import { MAX_CHARS, MAX_MEDIA } from '@shared/types'
import { api } from '../api'
import { Avatar, Button, Empty, PageHeader, Segmented, useRun, useToast } from '../ui'
import { cx, fmtSize, fmtWhen, mediaUrl, toLocalInput } from '../util'
import type { Nav } from '../App'

function defaultTime(): number {
  const d = new Date(Date.now() + 60 * 60000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return d.getTime()
}

export default function Compose({ state, nav }: { state: AppState; nav: Nav }) {
  const editing = nav.opts.editId ? state.posts.find((p) => p.id === nav.opts.editId) : undefined
  const toast = useToast()
  const run = useRun()
  const [accountIds, setAccountIds] = useState<string[]>(
    editing ? [editing.accountId] : nav.opts.accountId ? [nav.opts.accountId] : state.accounts.filter((a) => a.status !== 'expired').slice(0, 1).map((a) => a.id)
  )
  const [text, setText] = useState(editing?.text ?? '')
  const [media, setMedia] = useState<PickedFile[]>(editing?.media.map((m) => ({ path: m.path, name: m.name, size: m.size, type: m.type })) ?? [])
  const [mode, setMode] = useState<'now' | 'later'>(editing ? (editing.scheduledAt && editing.scheduledAt > Date.now() ? 'later' : 'now') : 'later')
  const [when, setWhen] = useState<number>(editing?.scheduledAt && editing.scheduledAt > Date.now() ? editing.scheduledAt : defaultTime())
  const [busy, setBusy] = useState(false)

  const selected = state.accounts.filter((a) => accountIds.includes(a.id))
  const problems = selected.filter((a) => a.status === 'expired' || a.paused)
  const over = text.length > MAX_CHARS
  const past = mode === 'later' && when < Date.now() - 30000
  const empty = !text.trim() && !media.length
  const canSubmit = !busy && !over && !empty && accountIds.length > 0 && !past

  const toggle = (id: string) => {
    if (editing) setAccountIds([id])
    else setAccountIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))
  }

  const addMedia = async () => {
    const files = await run(() => api.pickMedia())
    if (!files?.length) return
    const next = [...media, ...files.filter((f) => !media.some((m) => m.path === f.path))]
    if (next.length > MAX_MEDIA) toast('bad', `No máximo ${MAX_MEDIA} mídias por publicação.`)
    setMedia(next.slice(0, MAX_MEDIA))
  }

  const submit = async (draft: boolean) => {
    setBusy(true)
    const scheduledAt = mode === 'now' ? (draft ? null : Date.now()) : when
    const ok = await run(async () => {
      if (editing) {
        await api.updatePost(editing.id, { text, mediaPaths: media.map((m) => m.path), scheduledAt, accountId: accountIds[0], draft })
        if (!draft && mode === 'now') await api.publishNow(editing.id)
      } else {
        await api.createPosts({ accountIds, text, mediaPaths: media.map((m) => m.path), scheduledAt, draft })
      }
      return true
    })
    setBusy(false)
    if (!ok) return
    toast(
      'ok',
      draft
        ? 'Rascunho salvo.'
        : mode === 'now'
          ? `Publicando em ${accountIds.length} conta(s)…`
          : `Agendado em ${accountIds.length} conta(s) para ${new Date(when).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`
    )
    nav.go('posts')
  }

  const quick = useMemo(
    () => [
      { l: '+15 min', v: () => Date.now() + 15 * 60000 },
      { l: '+1 hora', v: () => Date.now() + 60 * 60000 },
      {
        l: 'Hoje 18:00',
        v: () => {
          const d = new Date()
          d.setHours(18, 0, 0, 0)
          return d.getTime()
        }
      },
      {
        l: 'Amanhã 09:00',
        v: () => {
          const d = new Date(Date.now() + 86400000)
          d.setHours(9, 0, 0, 0)
          return d.getTime()
        }
      }
    ],
    []
  )


  // Ctrl+Enter publica/agenda de qualquer lugar da tela
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault()
        if (canSubmitRef.current) submitRef.current(false)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  const canSubmitRef = useRef(canSubmit)
  canSubmitRef.current = canSubmit

  if (!state.accounts.length) {
    return (
      <div className="card">
        <Empty icon={<CalendarClock size={22} />} title="Conecte uma conta primeiro" text="Para agendar publicações, conecte pelo menos uma conta do Threads." action={<Button kind="primary" onClick={() => nav.go('accounts')}>Ir para Contas</Button>} />
      </div>
    )
  }

  const first = selected[0]
  const summary =
    accountIds.length === 0
      ? 'Escolha pelo menos uma conta'
      : `${accountIds.length === 1 ? `@${first?.handle}` : `${accountIds.length} contas`} · ${mode === 'now' ? 'agora' : fmtWhen(when)}${media.length ? ` · ${media.length} mídia(s)` : ''}`

  return (
    <div className="-mb-6 flex min-h-full flex-col">
      <PageHeader
        title={editing ? `Editar ${editing.code}` : 'Nova publicação'}
        subtitle={editing ? 'Altere o texto, as mídias ou o horário.' : 'Escreva uma vez e escolha as contas. Contas no mesmo horário publicam juntas.'}
      />
      <div className="grid flex-1 grid-cols-[1fr_360px] gap-5 pb-24">
        <div className="space-y-4">
          {/* contas */}
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">
                {editing ? 'Conta' : 'Publicar em'} {!editing && <span className="mono text-sub">{accountIds.length}/{state.accounts.length}</span>}
              </h2>
              {!editing && state.accounts.length > 1 && (
                <button className="text-sm text-violet-soft hover:underline" onClick={() => setAccountIds(accountIds.length === state.accounts.length ? [] : state.accounts.map((a) => a.id))}>
                  {accountIds.length === state.accounts.length ? 'Limpar seleção' : 'Selecionar todas'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {state.accounts.map((a) => {
                const on = accountIds.includes(a.id)
                return (
                  <button
                    key={a.id}
                    onClick={() => toggle(a.id)}
                    aria-pressed={on}
                    className={cx('flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition', on ? 'border-violet bg-violet/15' : 'border-s3 bg-s2 opacity-80 hover:border-sub hover:opacity-100')}
                  >
                    <Avatar account={a} size={26} />
                    <span className="font-medium">@{a.handle}</span>
                    {on && <Check size={14} className="text-violet-soft" />}
                  </button>
                )
              })}
            </div>
            {problems.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {problems.map((a) => `@${a.handle}`).join(', ')} {problems.length > 1 ? 'estão' : 'está'} desconectada(s) ou pausada(s). A publicação fica na fila até a conta voltar.
              </div>
            )}
          </section>

          {/* texto + mídias no mesmo bloco, como no Threads */}
          <section className="card p-4">
            <textarea
              className="input min-h-[150px] resize-y border-transparent bg-transparent px-0 text-md leading-relaxed focus:border-transparent focus:shadow-none"
              placeholder="O que há de novo?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            {media.length > 0 && (
              <div className="mb-3 mt-1 flex gap-2 overflow-x-auto pb-1">
                {media.map((m, i) => (
                  <div key={m.path} className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-s3 bg-canvas">
                    {m.type === 'image' ? <img src={mediaUrl(m.path)} className="h-full w-full object-cover" /> : <video src={mediaUrl(m.path)} className="h-full w-full object-cover" muted />}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 px-1.5 py-1 text-xs2">
                      <div className="mono text-sub">
                        {m.type === 'video' && <Film size={10} className="mr-1 inline" />}
                        {fmtSize(m.size)}
                      </div>
                    </div>
                    <button
                      aria-label={`Remover ${m.name}`}
                      className="absolute right-1 top-1 rounded-full bg-black/70 p-1 opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                      onClick={() => setMedia(media.filter((_, j) => j !== i))}
                    >
                      <X size={12} />
                    </button>
                    <span className="mono absolute left-1 top-1 rounded bg-black/60 px-1">{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-s2 pt-3">
              <Button size="sm" kind="ghost" icon={<ImagePlus size={15} />} onClick={addMedia} disabled={media.length >= MAX_MEDIA}>
                {media.length ? `Mídias ${media.length}/${MAX_MEDIA}` : 'Adicionar imagens ou vídeos'}
              </Button>
              <span className={cx('mono', over ? 'text-bad' : text.length > MAX_CHARS * 0.9 ? 'text-warn' : 'text-sub')}>
                {text.length}/{MAX_CHARS}
              </span>
            </div>
          </section>
          <p className="px-1 text-sm text-sub">Quebras de linha, emojis e #tópico funcionam como no Threads. Várias imagens viram carrossel (JPG, PNG, WEBP, GIF, MP4, MOV).</p>
        </div>

        {/* horário + prévia */}
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-3 font-semibold">Quando publicar</h2>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'later', label: 'Agendar' },
                { value: 'now', label: 'Publicar agora' }
              ]}
            />
            {mode === 'later' && (
              <>
                <input type="datetime-local" className="input mt-3" value={toLocalInput(when)} onChange={(e) => e.target.value && setWhen(new Date(e.target.value).getTime())} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {quick.map((q) => (
                    <button key={q.l} className="rounded-full border border-s3 px-2.5 py-1 text-sm text-sub hover:border-violet hover:text-white" onClick={() => setWhen(q.v())}>
                      {q.l}
                    </button>
                  ))}
                </div>
              </>
            )}
            {past && <div className="mt-2 text-sm text-bad">Esse horário já passou. Escolha outro ou "Publicar agora".</div>}
            {accountIds.length > 1 && (
              <div className="mt-3 flex items-start gap-2 text-sm text-sub">
                <Zap size={13} className="mt-0.5 shrink-0 text-violet-soft" />
                As {accountIds.length} contas publicam juntas, em paralelo.
              </div>
            )}
          </section>

          <div>
            <div className="kicker mb-2">Prévia</div>
            <div className="card2 p-4">
              <div className="flex gap-3">
                <Avatar account={first} size={36} ring={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{first?.handle ?? 'conta'}</span>
                    <span className="text-sub">{mode === 'now' ? 'agora' : fmtWhen(when)}</span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-md">{text || <span className="text-mute">Seu texto aparece aqui…</span>}</div>
                  {media.length > 0 && (
                    <div className="mt-3 flex gap-1.5 overflow-x-auto">
                      {media.map((m) => (
                        <div key={m.path} className={cx('shrink-0 overflow-hidden rounded-lg border border-s3', media.length === 1 ? 'w-full' : 'h-36 w-28')}>
                          {m.type === 'image' ? <img src={mediaUrl(m.path)} className="h-full w-full object-cover" /> : <video src={mediaUrl(m.path)} className="h-full w-full object-cover" muted />}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex gap-5 text-sub">
                    <Heart size={17} />
                    <MessageCircle size={17} />
                    <Repeat2 size={17} />
                    <Share size={17} />
                  </div>
                </div>
              </div>
            </div>
            {selected.length > 1 && <div className="mt-2 text-center text-sm text-sub">e mais {selected.length - 1} conta(s)</div>}
          </div>
        </aside>
      </div>

      {/* barra de ações sempre visível */}
      <div className="sticky bottom-0 -mx-7 mt-auto flex items-center gap-3 border-t border-s2 bg-[#0E1320]/95 px-7 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className={cx('truncate font-medium', !accountIds.length && 'text-warn')}>{summary}</div>
          <div className="text-sm text-sub">
            {empty ? 'Escreva um texto ou adicione uma mídia' : over ? `Passou de ${MAX_CHARS} caracteres` : past ? 'Horário no passado' : 'Ctrl + Enter para confirmar'}
          </div>
        </div>
        <Button kind="ghost" onClick={() => nav.go('posts')}>
          Cancelar
        </Button>
        <Button icon={<Save size={15} />} disabled={busy || empty || !accountIds.length || over} onClick={() => submit(true)}>
          Salvar rascunho
        </Button>
        <Button kind="primary" size="lg" icon={mode === 'now' ? <Send size={16} /> : <CalendarClock size={16} />} disabled={!canSubmit} loading={busy} onClick={() => submit(false)}>
          {mode === 'now' ? 'Publicar agora' : editing ? 'Salvar agendamento' : 'Agendar'}
        </Button>
      </div>
    </div>
  )
}
