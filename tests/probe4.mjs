// testa as funções reais de leitura (perfil + métricas) e detecção de sessão deslogada
import { chromium } from 'playwright-core'
import { build } from 'esbuild'
const out = process.argv[2] + '/threads-test.mjs'
await build({ entryPoints: ['src/main/threads.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, external: ['playwright-core', 'electron'],
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /^\.\/(browser|paths)$/ }, a => ({ path: a.path, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path.includes('paths') ? "export const p={selectors:()=> 'nope.json', screenshots:()=>'.'}" : 'export const launchVisible=()=>{};export const saveSession=()=>{}', loader: 'js' })) } }] })
const { pathToFileURL } = await import('url'); const T = await import(pathToFileURL(out).href)
const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
let t1=Date.now(); const prof = await T.readProfile(page, "zuck"); console.log("readProfile", Date.now()-t1, "ms")
console.log('profile:', prof.name, prof.followers, prof.avatar ? 'avatar ' + prof.avatar.length + ' chars' : 'no avatar')
let t0=Date.now(); console.log("metrics:", JSON.stringify(await T.readPostMetrics(page, "https://www.threads.com/@zuck/post/DfihFPxkaZ1")), (Date.now()-t0)+"ms")
await page.goto('https://www.threads.com/')
console.log('loggedIn (expected false):', await T.isLoggedIn(page))
await ctx.addCookies([{name:'sessionid',value:'fake',domain:'.threads.com',path:'/'}]); let t2=Date.now(); try { await T.preparePost(ctx, { handle: 'x', text: 'oi', files: [], videos: 0 }) } catch (e) { console.log('preparePost sessão inválida ->', e.name, (Date.now()-t2)+'ms') }
console.log('parse:', T.parseCount('Curtir1,4 mil'), T.parseCount('5,7 mi'), T.parseCount('12.345'), T.parseCount('Comentar286'), T.parseCount('Repostar'))
await b.close()
