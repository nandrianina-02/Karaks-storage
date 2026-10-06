/**
 * Médias générés pour les scénarios et la démonstration : aucun contenu
 * sous droits, tout est synthétisé ici.
 */
import { deflateSync } from 'node:zlib'

/** Mélodie synthétique : quelques notes sinusoïdales, avec une enveloppe. */
export function melody(seconds, seed = 1) {
  const rate = 22050
  const samples = rate * seconds
  const data = Buffer.alloc(44 + samples * 2)
  data.write('RIFF', 0)
  data.writeUInt32LE(36 + samples * 2, 4)
  data.write('WAVE', 8)
  data.write('fmt ', 12)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(rate, 24)
  data.writeUInt32LE(rate * 2, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(samples * 2, 40)
  const scale = [261.6, 293.7, 329.6, 349.2, 392, 440, 493.9, 523.3]
  for (let i = 0; i < samples; i += 1) {
    const t = i / rate
    const beat = Math.floor(t * 2)
    const note = scale[(beat * (3 + seed) + seed) % scale.length]
    const local = t * 2 - beat
    const envelope = Math.min(1, local * 20) * Math.exp(-local * 2.2) * (0.55 + 0.45 * Math.sin(t * 0.7 + seed))
    const value = Math.sin(2 * Math.PI * note * t) * 0.6 + Math.sin(2 * Math.PI * note * 2 * t) * 0.15
    data.writeInt16LE(Math.round(value * envelope * 22000), 44 + i * 2)
  }
  return new Uint8Array(data)
}

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) {
    crc ^= byte
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ -1) >>> 0
}

/** Petite image PNG unie avec un dégradé, pour les aperçus. */
export function png(width, height, [r, g, b]) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width; x += 1) {
      const o = y * (width * 3 + 1) + 1 + x * 3
      const shade = 0.55 + 0.45 * (x / width)
      raw[o] = r * shade
      raw[o + 1] = g * shade
      raw[o + 2] = b * (1 - 0.3 * (y / height))
    }
  }
  const chunk = (type, body) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(body.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body])))
    return Buffer.concat([length, Buffer.from(type), body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

