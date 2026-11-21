// Gera build/icon.png e resources/icon.png (256x256): quadrado roxo arredondado com um "∞" branco.
import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'

const N = 256
const px = Buffer.alloc(N * N * 4)

// pontos da lemniscata (símbolo de infinito)
const curve = []
for (let i = 0; i < 2000; i++) {
  const t = (i / 2000) * Math.PI * 2
  const d = 1 + Math.sin(t) ** 2
  curve.push([128 + (78 * Math.cos(t)) / d, 128 + (78 * Math.sin(t) * Math.cos(t)) / d])
}
const distCurve = (x, y) => {
  let m = Infinity
  for (const [cx, cy] of curve) m = Math.min(m, (x - cx) ** 2 + (y - cy) ** 2)
  return Math.sqrt(m)
}
const clamp = (v) => Math.max(0, Math.min(1, v))

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    // quadrado arredondado (raio 56) com antialias
    const r = 56
    const qx = Math.max(Math.abs(x + 0.5 - 128) - (128 - r - 6), 0)
    const qy = Math.max(Math.abs(y + 0.5 - 128) - (128 - r - 6), 0)
    const sd = Math.sqrt(qx * qx + qy * qy) - r
    const a = clamp(0.5 - sd)
    // gradiente 135° #8B5CF6 -> #6D28D9
    const g = clamp((x + y) / (2 * N))
    let R = 0x8b + (0x6d - 0x8b) * g
    let G = 0x5c + (0x28 - 0x5c) * g
    let B = 0xf6 + (0xd9 - 0xf6) * g
    // traço branco
    const w = clamp(11 - distCurve(x + 0.5, y + 0.5) + 0.5)
    R = R + (255 - R) * w
    G = G + (255 - G) * w
    B = B + (255 - B) * w
    const o = (y * N + x) * 4
    px[o] = R
    px[o + 1] = G
    px[o + 2] = B
    px[o + 3] = a * 255
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(N, 0)
ihdr.writeUInt32BE(N, 4)
ihdr[8] = 8
ihdr[9] = 6
const raw = Buffer.alloc(N * (N * 4 + 1))
for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4)
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])
for (const dir of ['build', 'resources']) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/icon.png`, png)
}
console.log('icon ok', png.length, 'bytes')
