import { _electron as electron } from 'playwright-core'
import { join } from 'path'
const root = process.cwd(), [dataDir] = process.argv.slice(2)
const app = await electron.launch({ executablePath: join(root, 'dist/win-unpacked/ThreadFlow.exe'), env: { ...process.env, TF_USER_DATA: dataDir } })
const win = await app.firstWindow()
await win.waitForTimeout(1500)
const p = win.evaluate(() => window.tf.call('connectAccount'))
await win.waitForTimeout(9000)
const st = await win.evaluate(() => window.tf.call('getState'))
console.log('connecting while window open:', st.runtime.connecting)
await win.evaluate(() => window.tf.call('cancelConnect'))
console.log('result:', JSON.stringify(await p))
await app.evaluate(({ app }) => app.exit(0))
