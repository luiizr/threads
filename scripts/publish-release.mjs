// Publica o instalador num ÚNICO release do GitHub, sempre substituído pela versão mais nova.
// Link fixo de download: https://github.com/<repo>/releases/latest/download/ThreadFlow-Setup.exe
//
// Uso: npm run release   (depois de `npm run dist`)
// Autenticação: usa o login do GitHub já salvo no Git deste PC (git credential); o token não é exibido.
import { execSync } from 'child_process'
import { readFileSync, statSync } from 'fs'
import { join } from 'path'

const REPO = 'luiizr/threads'
const TAG = 'instalador'
const ASSET = 'ThreadFlow-Setup.exe'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const file = join('dist', `ThreadFlow-Setup-${pkg.version}.exe`)
statSync(file) // erro claro se o instalador ainda não foi gerado

const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString()
const token = cred.match(/^password=(.+)$/m)?.[1]
if (!token) throw new Error('Login do GitHub não encontrado no Git deste PC. Faça um git push uma vez para salvar o login.')

const commit = execSync('git rev-parse HEAD').toString().trim()
const api = async (method, url, body, headers = {}) => {
  const r = await fetch(url.startsWith('http') ? url : `https://api.github.com${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'threadflow-release', ...headers },
    body: body && !(body instanceof Uint8Array) ? JSON.stringify(body) : body
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${await r.text()}`)
  return r.status === 204 ? {} : r.json()
}

// tag fixa apontando para o commit atual
if (await api('GET', `/repos/${REPO}/git/ref/tags/${TAG}`)) await api('PATCH', `/repos/${REPO}/git/refs/tags/${TAG}`, { sha: commit, force: true })
else await api('POST', `/repos/${REPO}/git/refs`, { ref: `refs/tags/${TAG}`, sha: commit })

const body = [
  `**Versão ${pkg.version}**`,
  '',
  'Baixe o **ThreadFlow-Setup.exe** abaixo e execute com dois cliques.',
  'Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**.',
  '',
  'Para atualizar, basta instalar por cima: contas e publicações são mantidas.'
].join('\n')

let rel = await api('GET', `/repos/${REPO}/releases/tags/${TAG}`)
const meta = { tag_name: TAG, name: `ThreadFlow ${pkg.version}`, body, draft: false, prerelease: false, make_latest: 'true' }
rel = rel ? await api('PATCH', `/repos/${REPO}/releases/${rel.id}`, meta) : await api('POST', `/repos/${REPO}/releases`, meta)

// apaga instaladores antigos do release e envia o novo
for (const a of rel.assets ?? []) await api('DELETE', `/repos/${REPO}/releases/assets/${a.id}`)
const data = new Uint8Array(readFileSync(file))
const up = await api('POST', `https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${ASSET}`, data, {
  'content-type': 'application/octet-stream'
})
console.log(`Release atualizado: ${rel.html_url}`)
console.log(`Download direto: ${up.browser_download_url}`)
