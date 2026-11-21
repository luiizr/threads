import { ReactNode, useEffect, useState, createContext, useContext, useCallback } from 'react'
import { X, Loader2, CheckCircle2, AlertTriangle, XCircle, Clock, FileText, Ban, RefreshCw, MoreHorizontal } from 'lucide-react'
import type { Account, PostStatus } from '@shared/types'
import { cx, initials } from './util'

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warn' | 'soft'

export function Button({
  kind = 'secondary',
  size = 'md',
  icon,
  children,
  className,
  loading,
  ...rest
}: {
  kind?: BtnKind
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  loading?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition active:translate-y-px disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap'
  const sizes = { sm: 'h-7 px-2.5 text-sm', md: 'h-9 px-3.5 text-base', lg: 'h-11 px-5 text-md font-semibold' }
  const kinds: Record<BtnKind, string> = {
    primary: 'bg-gradient-to-br from-violet to-violet-deep text-white shadow-glow hover:brightness-110',
    secondary: 'bg-s2 border border-s3 text-ink hover:bg-s3',
    ghost: 'text-sub hover:bg-s2 hover:text-white',
    danger: 'bg-bad/15 border border-bad/30 text-bad hover:bg-bad/25',
    warn: 'bg-warn text-black hover:brightness-110',
    soft: 'bg-violet/15 text-violet-soft border border-violet/30 hover:bg-violet/25'
  }
  return (
    <button className={cx(base, sizes[size], kinds[kind], className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

const TONES = {
  ok: 'bg-ok/10 text-ok border-ok/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  bad: 'bg-bad/10 text-bad border-bad/25',
  info: 'bg-info/10 text-info border-info/25',
  violet: 'bg-violet/10 text-violet-soft border-violet/25',
  mute: 'bg-s2 text-sub border-s3'
}
export type Tone = keyof typeof TONES

export function Badge({ tone = 'mute', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-sm font-medium', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

export function Dot({ tone = 'ok', pulse }: { tone?: 'ok' | 'warn' | 'bad' | 'info' | 'violet'; pulse?: boolean }) {
  const c = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', info: 'bg-info', violet: 'bg-violet' }[tone]
  return (
    <span className="relative inline-flex h-1.5 w-1.5">
      {pulse && <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', c)} />}
      <span className={cx('relative inline-flex h-1.5 w-1.5 rounded-full', c)} />
    </span>
  )
}

export const POST_STATUS: Record<PostStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  draft: { label: 'Rascunho', tone: 'mute', icon: <FileText size={12} /> },
  scheduled: { label: 'Agendado', tone: 'info', icon: <Clock size={12} /> },
  publishing: { label: 'Publicando', tone: 'violet', icon: <RefreshCw size={12} className="animate-spin" /> },
  published: { label: 'Publicado', tone: 'ok', icon: <CheckCircle2 size={12} /> },
  failed: { label: 'Falhou', tone: 'bad', icon: <XCircle size={12} /> },
  canceled: { label: 'Cancelado', tone: 'mute', icon: <Ban size={12} /> }
}

export function PostBadge({ status, retrying }: { status: PostStatus; retrying?: boolean }) {
  const s = POST_STATUS[status]
  if (status === 'scheduled' && retrying)
    return (
      <Badge tone="warn" icon={<RefreshCw size={12} />}>
        Nova tentativa
      </Badge>
    )
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  )
}

export function AccountBadge({ account }: { account: Account }) {
  if (account.paused)
    return (
      <Badge tone="warn" icon={<AlertTriangle size={12} />}>
        Pausada
      </Badge>
    )
  switch (account.status) {
    case 'connected':
      return (
        <Badge tone="ok" icon={<CheckCircle2 size={12} />}>
          Conectada
        </Badge>
      )
    case 'checking':
      return (
        <Badge tone="info" icon={<Loader2 size={12} className="animate-spin" />}>
          Verificando
        </Badge>
      )
    case 'expired':
      return (
        <Badge tone="bad" icon={<XCircle size={12} />}>
          Desconectada
        </Badge>
      )
    default:
      return (
        <Badge tone="warn" icon={<AlertTriangle size={12} />}>
          Sem resposta
        </Badge>
      )
  }
}

export function Avatar({ account, size = 36, ring = true }: { account?: Account; size?: number; ring?: boolean }) {
  const dot =
    account && ring
      ? account.status === 'expired'
        ? 'bg-bad'
        : account.status === 'error' || account.paused
          ? 'bg-warn'
          : account.status === 'connected'
            ? 'bg-ok'
            : 'bg-info'
      : null
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {account?.avatar ? (
        <img src={account.avatar} className="h-full w-full rounded-full object-cover" alt="" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{ background: account?.color ?? '#8B5CF6', fontSize: size * 0.36 }}
        >
          {initials(account?.name || account?.handle || '?')}
        </span>
      )}
      {dot && <span className={cx('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-s1', dot)} />}
    </span>
  )
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition disabled:opacity-50',
        checked ? 'border-violet bg-violet-deep' : 'border-s3 bg-s2'
      )}
    >
      <span className={cx('inline-block h-3.5 w-3.5 rounded-full bg-white transition', checked ? 'translate-x-[18px]' : 'translate-x-[2px]')} />
    </button>
  )
}

export function Modal({ open, onClose, title, children, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onMouseDown={onClose}>
      <div className="max-h-full overflow-auto rounded-xl bg-s2 shadow-modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-s3 px-5 py-3.5">
          <h3 className="text-md font-semibold">{title}</h3>
          <button className="rounded-md p-1 text-sub hover:bg-s3 hover:text-white" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-s2 bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cx('rounded-md px-3 py-1.5 text-base transition', value === o.value ? 'bg-violet-deep text-white' : 'text-sub hover:text-white')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-s2 text-violet-soft">{icon}</div>
      <div className="text-md font-semibold">{title}</div>
      {text && <div className="max-w-md text-base text-sub">{text}</div>}
      {action}
    </div>
  )
}

export function PageHeader({ title, kicker, subtitle, actions }: { title: ReactNode; kicker?: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {kicker}
        </div>
        {subtitle && <p className="mt-1 max-w-3xl text-md text-sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

// ---------- menu de ações (⋯) ----------
export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  hidden?: boolean
}

export function ActionMenu({ items, label = 'Mais ações' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])
  const visibleItems = items.filter((i) => !i.hidden)
  if (!visibleItems.length) return null
  return (
    <div className="relative">
      <button
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation()
          // perto do rodapé, abre para cima
          setUp(e.clientY > window.innerHeight - 60 - items.filter((i) => !i.hidden).length * 38)
          setOpen(!open)
        }}
        className={cx('flex h-7 w-7 items-center justify-center rounded-lg text-sub hover:bg-s2 hover:text-white', open && 'bg-s2 text-white')}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className={cx('absolute right-0 z-40 min-w-[200px] whitespace-nowrap rounded-lg bg-s2 p-1 shadow-pop', up ? 'bottom-8' : 'top-8')}>
          {visibleItems.map((i) => (
            <button
              key={i.label}
              onClick={() => {
                setOpen(false)
                i.onClick()
              }}
              className={cx('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-base', i.danger ? 'text-bad hover:bg-bad/10' : 'text-ink hover:bg-s3')}
            >
              <span className="text-sub">{i.icon}</span>
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- confirmação dentro do app (no lugar do confirm() do Windows) ----------
type ConfirmOpts = { title: string; text?: string; confirmLabel?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false)
export const useConfirm = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setReq({ ...o, resolve })), [])
  const done = (v: boolean) => {
    req?.resolve(v)
    setReq(null)
  }
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!req} onClose={() => done(false)} title={req?.title ?? ''} width={440}>
        {req?.text && <p className="text-md text-sub">{req.text}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button kind="ghost" onClick={() => done(false)}>
            Voltar
          </Button>
          <Button kind={req?.danger ? 'danger' : 'primary'} onClick={() => done(true)} autoFocus>
            {req?.confirmLabel ?? 'Confirmar'}
          </Button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  )
}

// ---------- avisos rápidos ----------
type ToastT = { id: number; tone: 'ok' | 'bad' | 'info'; text: string }
const ToastCtx = createContext<(tone: ToastT['tone'], text: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([])
  const push = useCallback((tone: ToastT['tone'], text: string) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, tone, text }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'bad' ? 7000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-96 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-s2 px-3.5 py-3 text-base shadow-pop',
              t.tone === 'ok' ? 'border-ok/30' : t.tone === 'bad' ? 'border-bad/40' : 'border-s3'
            )}
          >
            {t.tone === 'ok' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" />
            ) : t.tone === 'bad' ? (
              <XCircle size={16} className="mt-0.5 shrink-0 text-bad" />
            ) : (
              <Clock size={16} className="mt-0.5 shrink-0 text-info" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/** executa uma ação e mostra o erro como aviso */
export function useRun() {
  const toast = useToast()
  return useCallback(
    async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
      try {
        const r = await fn()
        if (okMsg) toast('ok', okMsg)
        return r
      } catch (e) {
        toast('bad', (e as Error).message.replace(/^Error invoking remote method 'api': Error: /, ''))
        return undefined
      }
    },
    [toast]
  )
}

export function StatCard({ label, value, icon, tone, active, onClick, sub }: { label: string; value: ReactNode; icon: ReactNode; tone?: Tone; active?: boolean; onClick?: () => void; sub?: ReactNode }) {
  const dot = tone && tone !== 'mute' ? { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', info: 'bg-info', violet: 'bg-violet' }[tone] : null
  return (
    <button
      onClick={onClick}
      className={cx('card flex items-center justify-between px-4 py-3 text-left transition hover:border-s3', active && 'border-violet/60 bg-s2', !onClick && 'cursor-default')}
    >
      <div>
        <div className="kicker flex items-center gap-1.5">
          {dot && <span className={cx('h-1.5 w-1.5 rounded-full', dot)} />}
          {label}
        </div>
        <div className="mt-1 text-xl font-bold tabular">{value}</div>
        {sub}
      </div>
      <div className={cx('flex h-9 w-9 items-center justify-center rounded-lg', tone ? TONES[tone] : 'bg-s2 text-sub', 'border')}>{icon}</div>
    </button>
  )
}
