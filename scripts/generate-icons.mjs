import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync } from 'zlib'

// CRC32
const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  crcTable[i] = c
}
const crc32 = (buf) => {
  let crc = 0xFFFFFFFF
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8)
  return (~crc) >>> 0
}

const pngChunk = (type, data) => {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crcBuf])
}

function makeIcon(size) {
  const stride = 1 + size * 3
  const raw = Buffer.alloc(size * stride) // all zeros = black bg

  const setPixel = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const d = y * stride + 1 + x * 3
    raw[d] = r; raw[d + 1] = g; raw[d + 2] = b
  }

  const fillRect = (x1, y1, w, h, r, g, b) => {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        setPixel(x1 + dx, y1 + dy, r, g, b)
  }

  const fillRoundRect = (x1, y1, w, h, rad, r, g, b) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        let skip = false
        if (dx < rad && dy < rad) skip = (rad - dx) ** 2 + (rad - dy) ** 2 > rad ** 2
        else if (dx >= w - rad && dy < rad) skip = (dx - (w - rad - 1)) ** 2 + (rad - dy) ** 2 > rad ** 2
        else if (dx < rad && dy >= h - rad) skip = (rad - dx) ** 2 + (dy - (h - rad - 1)) ** 2 > rad ** 2
        else if (dx >= w - rad && dy >= h - rad) skip = (dx - (w - rad - 1)) ** 2 + (dy - (h - rad - 1)) ** 2 > rad ** 2
        if (!skip) setPixel(x1 + dx, y1 + dy, r, g, b)
      }
    }
  }

  // Draw mic — all coords relative to 192x192, scaled to `size`
  const sc = (n) => Math.round(n * size / 192)
  const Y = 255, G = 215, B = 0 // #FFD700 yellow

  // Capsule (rounded pill): centered, upper half
  fillRoundRect(sc(72), sc(28), sc(48), sc(72), sc(24), Y, G, B)

  // Bracket arms — drawn as thick arc (∩ shape), y=100
  const arcCX = sc(96), arcCY = sc(100), arcR = sc(30)
  const sw = Math.max(3, sc(7))
  for (let a = 0; a <= 180; a++) {
    const rad = (a * Math.PI) / 180
    for (let t = 0; t < sw; t++) {
      const nx = Math.round(arcCX + (arcR - t) * Math.cos(Math.PI - rad))
      const ny = Math.round(arcCY - (arcR - t) * Math.sin(Math.PI - rad))
      setPixel(nx, ny, Y, G, B)
    }
  }

  // Stand
  fillRect(sc(91), sc(100), sc(10), sc(42), Y, G, B)

  // Base bar
  fillRoundRect(sc(66), sc(142), sc(60), sc(10), sc(5), Y, G, B)

  // Build PNG
  for (let y = 0; y < size; y++) raw[y * stride] = 0 // filter bytes already 0

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
writeFileSync('public/pwa-192x192.png', makeIcon(192))
writeFileSync('public/pwa-512x512.png', makeIcon(512))
writeFileSync('public/apple-touch-icon.png', makeIcon(180))
console.log('Icons generiert: pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png')
