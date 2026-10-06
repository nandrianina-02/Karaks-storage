import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { checkFileType, detectSignature, formatBytes, sanitizeFileName } from './types'

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((value) => (typeof value === 'string' ? [...value].map((c) => c.charCodeAt(0)) : [value])))

describe('detectSignature', () => {
  it('reconnaît les formats audio', () => {
    assert.equal(detectSignature(bytes('ID3', 3, 0, 0)), 'mp3')
    assert.equal(detectSignature(bytes(0xff, 0xfb, 0x90, 0x00)), 'mp3')
    assert.equal(detectSignature(bytes(0xff, 0xf1, 0x50, 0x80)), 'aac')
    assert.equal(detectSignature(bytes('RIFF', 0, 0, 0, 0, 'WAVE')), 'wav')
    assert.equal(detectSignature(bytes('OggS', 0)), 'ogg')
    assert.equal(detectSignature(bytes('fLaC', 0)), 'flac')
    assert.equal(detectSignature(bytes(0, 0, 0, 0x20, 'ftypM4A ')), 'mp4')
  })

  it('reconnaît les images, la vidéo et les documents', () => {
    assert.equal(detectSignature(bytes(0xff, 0xd8, 0xff, 0xe0)), 'jpeg')
    assert.equal(detectSignature(bytes(0x89, 'PNG', 0x0d, 0x0a)), 'png')
    assert.equal(detectSignature(bytes('RIFF', 0, 0, 0, 0, 'WEBP')), 'webp')
    assert.equal(detectSignature(bytes('GIF89a')), 'gif')
    assert.equal(detectSignature(bytes(0x1a, 0x45, 0xdf, 0xa3)), 'webm')
    assert.equal(detectSignature(bytes('%PDF-1.7')), 'pdf')
    assert.equal(detectSignature(new TextEncoder().encode('Bonjour, café')), 'text')
  })

  it('ne prend pas un binaire pour du texte', () => {
    assert.equal(detectSignature(bytes('MZ', 0x90, 0, 3, 0)), null)
  })

  it('tolère un caractère multi-octets coupé en fin d’échantillon', () => {
    const text = new TextEncoder().encode('été')
    assert.equal(detectSignature(text.subarray(0, text.length - 1)), 'text')
  })
})

describe('checkFileType', () => {
  const mp3 = bytes('ID3', 3, 0, 0, 0, 0)

  it('accepte un fichier cohérent et impose le type de la table', () => {
    const result = checkFileType('papaoutai.MP3', 'audio/mp3', mp3)
    assert.deepEqual(result, { ok: true, extension: 'mp3', mimeType: 'audio/mpeg', category: 'audio' })
  })

  it('accepte un type générique annoncé par le client', () => {
    assert.equal(checkFileType('a.mp3', 'application/octet-stream', mp3).ok, true)
    assert.equal(checkFileType('a.mp3', '', mp3).ok, true)
  })

  it('refuse une extension inconnue', () => {
    assert.equal(checkFileType('script.exe', 'application/octet-stream').ok, false)
    assert.equal(checkFileType('sans-extension', '').ok, false)
  })

  it('refuse un type annoncé qui contredit l’extension', () => {
    assert.equal(checkFileType('a.mp3', 'image/png', mp3).ok, false)
  })

  it('refuse un exécutable déguisé en mp3', () => {
    const result = checkFileType('chanson.mp3', 'audio/mpeg', bytes('MZ', 0x90, 0, 3, 0, 0, 0))
    assert.equal(result.ok, false)
  })

  it('refuse une image déguisée en audio', () => {
    assert.equal(checkFileType('a.wav', 'audio/wav', bytes(0x89, 'PNG', 0x0d, 0x0a)).ok, false)
  })
})

describe('sanitizeFileName', () => {
  it('retire les chemins et les caractères dangereux', () => {
    assert.equal(sanitizeFileName('../../etc/passwd.txt'), 'passwd.txt')
    assert.equal(sanitizeFileName('C:\\Users\\x\\chanson.mp3'), 'chanson.mp3')
    assert.equal(sanitizeFileName('a<b>c:"d|e?f*.mp3'), 'abcdef.mp3')
    assert.equal(sanitizeFileName('ligne\u0000\u001fnulle.mp3'), 'lignenulle.mp3')
  })

  it('ne laisse pas de nom caché ni réservé', () => {
    assert.equal(sanitizeFileName('...cache.mp3'), 'cache.mp3')
    assert.equal(sanitizeFileName('CON.txt'), '_CON.txt')
    assert.equal(sanitizeFileName('   '), 'fichier')
  })

  it('raccourcit un nom trop long en gardant l’extension', () => {
    const name = sanitizeFileName(`${'a'.repeat(400)}.flac`)
    assert.equal(name.length, 180)
    assert.ok(name.endsWith('.flac'))
  })

  it('normalise les accents', () => {
    assert.equal(sanitizeFileName('e\u0301te\u0301.mp3'), 'été.mp3')
  })
})

describe('formatBytes', () => {
  it('affiche des unités françaises', () => {
    assert.equal(formatBytes(0), '0 o')
    assert.equal(formatBytes(420 * 1024), '420 Ko')
    assert.equal(formatBytes(8.4 * 1024 * 1024), '8,4 Mo')
    assert.equal(formatBytes(68.4 * 1024 ** 3), '68,4 Go')
  })
})
