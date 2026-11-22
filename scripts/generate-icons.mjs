// Generates the PWA PNG icons procedurally (no external assets).
// Usage: npm run icons
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePNG(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size)
      const i = y * (size * 4 + 1) + 1 + x * 4
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

// Simple scene: sky gradient, island silhouette with snowy peak, sea.
function pixel(u, v) {
  const sea = 0.64
  if (v > sea) return mix([31, 120, 180], [16, 70, 130], (v - sea) / (1 - sea))
  // mountain profile
  const peak = 0.32 + 0.12 * Math.abs(u - 0.52) * 2.2 + 0.05 * Math.sin(u * 18)
  const inIsland = u > 0.1 && u < 0.9 && v > peak + Math.pow(Math.abs(u - 0.5) * 2, 3) * 0.3
  if (inIsland) {
    if (v > sea - 0.035) return [241, 220, 162] // beach
    if (v < 0.42 && Math.abs(u - 0.52) < 0.1) return [244, 241, 232] // snow
    return mix([92, 160, 80], [58, 118, 62], (v - 0.35) / 0.3)
  }
  return mix([95, 180, 236], [191, 230, 251], v / sea)
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), encodePNG(size, pixel))
  console.log('wrote public/' + name)
}
