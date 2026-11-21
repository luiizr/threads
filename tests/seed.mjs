// Dados fictícios só para ver as telas preenchidas (não vai no app).
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
const dir = join(process.argv[2], 'data'); mkdirSync(dir, { recursive: true })
const now = Date.now(), H = 3600e3, D = 24 * H
const acc = (id, handle, name, color, followers, status = 'connected') => ({ id, handle, name, color, followers, status, paused: false, createdAt: now - 20 * D, lastCheckedAt: now - 4 * 60e3 })
const accounts = [acc('a1','techpulse.br','TechPulse Brasil','#8B5CF6',84200), acc('a2','modaurbana','Moda Urbana SP','#22D3EE',42800), acc('a3','cafecriativo','Café Criativo Co.','#F59E0B',16300,'expired')]
let seq = 1000
const post = (accountId, status, t, text, extra = {}) => ({ id: 'p' + (++seq), code: 'TF-' + seq, accountId, text, media: [], scheduledAt: t, status, attempts: 0, createdAt: t - D, updatedAt: t, ...extra })
const posts = []
for (let i = 1; i < 7; i++) for (const a of ['a1', 'a2']) {
  const t = now - i * D + (a === 'a1' ? 2 : 5) * H
  posts.push(post(a, 'published', t, `Publicação de exemplo ${i} da conta ${a}: dicas rápidas sobre produtividade e criação de conteúdo.`, { publishedAt: t, url: 'https://www.threads.com/@x/post/abc', metrics: { views: Math.round(5000 + Math.random() * 20000 * (a === 'a1' ? 2 : 1)), likes: Math.round(200 + Math.random() * 900), replies: Math.round(10 + Math.random() * 80), reposts: Math.round(5 + Math.random() * 60) }, metricsUpdatedAt: now - H }))
}
posts.push(post('a1', 'scheduled', now + 3 * H, '5 ferramentas de IA que você precisa testar esta semana no seu fluxo de trabalho.'))
posts.push(post('a2', 'scheduled', now + 3 * H, 'Tendências de outono/inverno que estão dominando as ruas de SP com alfaiataria.'))
posts.push(post('a3', 'scheduled', now + 5 * H, 'Bastidores da nossa torra de café especial.'))
posts.push(post('a1', 'publishing', now, 'Saiu a nova versão do nosso guia de automação. Confira o que mudou!', { progress: 'Enviando 1 mídia(s)' }))
posts.push(post('a3', 'failed', now - 2 * H, 'Dicas essenciais para manter o foco na criação diária.', { attempts: 4, error: 'Não encontrei o editor de nova publicação no Threads.', lastLogId: 'LOG-ERR001' }))
posts.push(post('a2', 'draft', null, 'Guia de tecidos sustentáveis e marcas nacionais (rascunho).'))
const followers = []
for (const a of accounts) for (let i = 14; i >= 0; i--) followers.push({ accountId: a.id, ts: now - i * D, followers: a.followers - i * Math.round(a.followers / 400) })
writeFileSync(join(dir, 'db.json'), JSON.stringify({ accounts, posts, followers, seq, settings: { onboarded: true, userName: 'Luiz Silva', userRole: 'Social Media Lead' } }))
const logs = [
  { id: 'LOG-ERR001', ts: now - 2 * H, level: 'error', category: 'Publicação', accountId: 'a3', postId: posts.find(p => p.status === 'failed').id, message: 'Falha ao publicar TF-1019 em @cafecriativo: Não encontrei o editor de nova publicação no Threads.', details: 'Etapa: abrir editor\nTentativa: 4/4' },
  { id: 'LOG-W01', ts: now - 3 * H, level: 'warn', category: 'Conta', accountId: 'a3', message: 'Sessão de @cafecriativo expirou. 1 publicação(ões) aguardando reconexão.' },
  { id: 'LOG-I01', ts: now - 5 * H, level: 'info', category: 'Publicação', accountId: 'a1', message: 'Publicado com sucesso em @techpulse.br (TF-1011). Confirmação em 2140 ms.' },
]
writeFileSync(join(dir, 'logs.json'), JSON.stringify(logs))
console.log('seeded')
