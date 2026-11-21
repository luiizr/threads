// Capturas de todas as telas com dados fictícios. Uso: node tests/shots-all.mjs <dados> <saída>
import { _electron as electron } from 'playwright-core'
import { join } from 'path'
import { mkdirSync } from 'fs'
const root = process.cwd(), [dataDir, outDir] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: ['--disable-features=CalculateNativeWinOcclusion', root], env: { ...process.env, TF_USER_DATA: dataDir } })
try {
  const win = await app.firstWindow()
  win.on('pageerror', (e) => console.log('pageerror:', e.message))
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1440, 900); w.center() })
  await win.waitForTimeout(2500)
  const go = async (label) => { await win.locator('aside nav button', { hasText: label }).click(); await win.waitForTimeout(800) }
  for (const [label, file] of [['Métricas', 'm'], ['Contas', 'a'], ['Agendar', 'c'], ['Publicações', 'p'], ['Logs', 'l'], ['Configurações', 's']]) {
    await go(label)
    await win.screenshot({ path: join(outDir, file + '.png') })
  }
  // tela de agendar preenchida
  await go('Agendar')
  await win.locator('textarea').fill('Teste de publicação com duas linhas\nsegunda linha aqui')
  await win.screenshot({ path: join(outDir, 'c2.png') })
  await go('Contas')
  await win.locator('button:has(svg[aria-label="Lista"])').click()
  await win.waitForTimeout(400)
  await win.screenshot({ path: join(outDir, 'a2.png') })
  await go('Publicações')
  await win.locator('button[aria-label="Mais ações"]').nth(2).click()
  await win.waitForTimeout(300)
  await win.screenshot({ path: join(outDir, 'p2.png') })
  await win.keyboard.press('Escape')
  await win.getByText('Semana', { exact: true }).click()
  await win.waitForTimeout(400)
  await win.screenshot({ path: join(outDir, 'p3.png') })
  await win.getByText('Lista', { exact: true }).click()
  await win.locator('button[aria-label="Mais ações"]').nth(2).click()
  await win.getByRole('button', { name: 'Excluir' }).click()
  await win.waitForTimeout(300)
  await win.screenshot({ path: join(outDir, 'p4.png') })
  await win.keyboard.press('Escape')
  await go('Configurações')
  await win.locator('main').evaluate((m) => m.scrollTo(0, 900))
  await win.waitForTimeout(400)
  await win.screenshot({ path: join(outDir, 's2.png') })
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
  process.exit(0)
}
