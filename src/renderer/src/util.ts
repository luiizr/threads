export const mediaUrl = (path: string) => `tfmedia://file/?p=${encodeURIComponent(path)}`

export function fmtNum(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR')
}

export function fmtShort(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (n >= 1e6) return (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  if (n >= 1e4) return (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
  return n.toLocaleString('pt-BR')
}

export function fmtSize(b: number): string {
  if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB'
  return Math.max(1, Math.round(b / 1e3)) + ' KB'
}

const pad = (n: number) => String(n).padStart(2, '0')

export function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtTimeSec(ts: number): string {
  const d = new Date(ts)
  return `${fmtTime(ts)}:${pad(d.getSeconds())}`
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function relDay(ts: number): string {
  const today = dayKey(Date.now())
  const k = dayKey(ts)
  if (k === today) return 'Hoje'
  if (k === dayKey(Date.now() + 86400000)) return 'Amanhã'
  if (k === dayKey(Date.now() - 86400000)) return 'Ontem'
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

export function fmtWhen(ts: number): string {
  return `${relDay(ts)}, ${fmtTime(ts)}`
}

export function ago(ts?: number): string {
  if (!ts) return 'nunca'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'agora'
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `há ${h} h`
  return `há ${Math.round(h / 24)} d`
}

export function toLocalInput(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'TF'
  )
}

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ')
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}
