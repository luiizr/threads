import { _electron as electron } from 'playwright-core'
import { join } from 'path'
const root = process.cwd(), [dataDir, outDir] = process.argv.slice(2)
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: ['--disable-features=CalculateNativeWinOcclusion', root], env: { ...process.env, TF_USER_DATA: dataDir } })
const win = await app.firstWindow()
win.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text(), JSON.stringify(m.location())) })
win.on('pageerror', (e) => console.log('pageerror:', e.message))
win.on('requestfailed', (r) => console.log('reqfail:', r.url().slice(0, 120)))
await win.waitForTimeout(2500)
for (const [label, file] of [['Métricas','m'],['Contas','a'],['Agendar','c'],['Publicações','p'],['Logs','l'],['Configurações','s']]) {
  await win.locator('aside nav button', { hasText: label }).click(); await win.waitForTimeout(900)
  if (label === 'Logs') { await win.getByText('Falha ao publicar TF-1019').first().click(); await win.waitForTimeout(400) }
  await win.screenshot({ path: join(outDir, file + '.png') })
}
await app.evaluate(({ app }) => app.exit(0))
