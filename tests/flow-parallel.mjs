// 8 contas com sessão falsa e post no mesmo horário: mede em quanto tempo a fila processa todas
// e o pico de memória do Edge. Uso: node tests/flow-parallel.mjs <pasta-de-dados-temporária>
import { _electron as electron } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const root = process.cwd()
const dataDir = process.argv[2]
const N = Number(process.env.N || 8)
const PREP = 15
const d = join(dataDir, 'data')
mkdirSync(join(d, 'sessions'), { recursive: true })
const now = Date.now()
const accounts = Array.from({ length: N }, (_, i) => ({ id: 'a' + i, handle: 'conta' + i, name: 'Conta ' + i, color: '#8B5CF6', status: 'connected', paused: false, createdAt: now }))
const fake = { cookies: [{ name: 'sessionid', value: 'fake', domain: '.threads.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }], origins: [] }
for (const a of accounts) writeFileSync(join(d, 'sessions', a.id + '.bin'), JSON.stringify(fake))
writeFileSync(join(d, 'db.json'), JSON.stringify({ accounts, posts: [], followers: [], seq: 1, settings: { onboarded: true, userName: 'Teste', maxConcurrent: 0, checkIntervalMin: 0, metricsIntervalMin: 0, prepareSeconds: PREP, lightMode: process.env.LIGHT !== '0' } }))

function edgeMB() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq msedge.exe" /FO CSV /NH', { timeout: 4000 }).toString()
    let kb = 0
    for (const line of out.split('\n')) {
      const cols = line.split('","')
      if (cols.length >= 5) kb += parseInt(cols[4].replace(/[^0-9]/g, ''), 10) || 0
    }
    return kb / 1024
  } catch {
    return 0
  }
}

const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], env: { ...process.env, TF_USER_DATA: dataDir } })
try {
  const win = await app.firstWindow()
  await win.waitForTimeout(1500)
  const st0 = await win.evaluate(() => window.tf.call('getState'))
  console.log('vagas automáticas neste PC:', st0.runtime.concurrency)
  const at = Date.now() + (PREP + 5) * 1000
  await win.evaluate(({ ids, at }) => window.tf.call('createPosts', { accountIds: ids, text: 'teste paralelo', mediaPaths: [], scheduledAt: at, draft: false }), { ids: accounts.map((a) => a.id), at })
  const base = edgeMB()
  let peak = 0
  const t0 = Date.now()
  let ok = false
  let i = 0
  while (Date.now() - t0 < 90000) {
    const st = await win.evaluate(() => window.tf.call('getState'))
    if (i++ % 3 === 0) peak = Math.max(peak, edgeMB())
    if (st.accounts.filter((a) => a.status === 'expired').length === N) {
      ok = true
      break
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  const logs = await win.evaluate(() => window.tf.call('getLogs'))
  const ts = logs.filter((l) => l.message.startsWith('Não publicado')).map((l) => l.ts)
  const prepStart = at - PREP * 1000
  console.log(ok ? `todas as ${N} contas processadas` : 'NÃO terminou em 90 s')
  if (ts.length) console.log(`primeira conta resolvida ${((Math.min(...ts) - prepStart) / 1000).toFixed(1)} s após começar a preparar; última ${((Math.max(...ts) - prepStart) / 1000).toFixed(1)} s`)
  console.log('pico de memória do Edge:', Math.round(peak - base), 'MB acima do normal')
  console.log(logs.find((l) => l.message.includes('Sessão de @conta0'))?.message)
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
  process.exit(0)
}
