// Abre o app com dados de teste e tira capturas de cada tela.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const dataDir = process.argv[2]
const outDir = process.argv[3]
mkdirSync(outDir, { recursive: true })
const app = await electron.launch({
  executablePath: join(root, 'node_modules/electron/dist/electron.exe'),
  args: ['--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding', root],
  env: { ...process.env, TF_USER_DATA: dataDir }
})
const win = await app.firstWindow()
win.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()) })
win.on('pageerror', (e) => console.log('pageerror:', e.message))
await win.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
await win.waitForTimeout(2500)
await win.screenshot({ path: join(outDir, '0-start.png') })
const step = process.argv[4] || 'all'
if (step === 'all') {
  // onboarding se necessário
  const name = win.locator('input[placeholder="Ex.: Luiz"]')
  if (await name.isVisible().catch(() => false)) {
    await name.fill('Luiz Teste')
    await win.getByRole('button', { name: /Continuar/ }).click()
    await win.waitForTimeout(500)
    await win.screenshot({ path: join(outDir, '1-welcome2.png') })
    await win.getByRole('button', { name: /Continuar/ }).click()
    await win.waitForTimeout(300)
    await win.getByRole('button', { name: /Abrir o painel/ }).click()
    await win.waitForTimeout(800)
  }
  for (const [label, file] of [['Métricas','2-metrics'],['Contas','3-accounts'],['Agendar','4-compose'],['Publicações','5-posts'],['Logs','6-logs'],['Configurações','7-settings']]) {
    await win.locator('aside nav button', { hasText: label }).click()
    await win.waitForTimeout(700)
    await win.screenshot({ path: join(outDir, file + '.png') })
  }
}
await app.evaluate(({ app }) => { app.exit(0) })
console.log('ok')
