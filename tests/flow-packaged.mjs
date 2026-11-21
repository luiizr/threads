// Fluxo da fila: cria post para conta sem sessão -> deve marcar conta como desconectada e manter o post na fila.
import { _electron as electron } from 'playwright-core'
import { join } from 'path'
const root = process.cwd(), [dataDir] = process.argv.slice(2)
const app = await electron.launch({ executablePath: join(root, 'dist/win-unpacked/ThreadFlow.exe'), args: ['--disable-features=CalculateNativeWinOcclusion'], env: { ...process.env, TF_USER_DATA: dataDir } })
const win = await app.firstWindow()
win.on('pageerror', (e) => console.log('pageerror:', e.message))
await win.waitForTimeout(2000)
const ids = await win.evaluate(() => window.tf.call('createPosts', { accountIds: ['a1', 'a2'], text: 'Teste da fila\nsegunda linha', mediaPaths: [], scheduledAt: Date.now() + 3000, draft: false }))
console.log('created', ids.length)
await win.waitForTimeout(35000)
const st = await win.evaluate(() => window.tf.call('getState'))
for (const id of ids) { const p = st.posts.find(x => x.id === id); console.log(p.code, p.status, '|', p.error) }
for (const a of st.accounts) console.log('@' + a.handle, a.status)
const logs = await win.evaluate(() => window.tf.call('getLogs'))
console.log(logs.slice(0, 6).map(l => `${l.level} ${l.category}: ${l.message}`).join('\n'))
await app.evaluate(({ app }) => app.exit(0))
