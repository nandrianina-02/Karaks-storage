/**
 * Types de fichiers acceptés et contrôle de leur contenu (CDS 10).
 *
 * Trois informations sont croisées : l'extension du nom, le type MIME annoncé
 * par le client, et la signature réelle des premiers octets. Les deux
 * premières sont déclaratives — n'importe quel client peut les choisir. Seule
 * la signature dit ce que contient vraiment le fichier : c'est elle qui
 * empêche de déposer un exécutable sous le nom `chanson.mp3`.
 */

export type FileCategory = 'audio' | 'image' | 'video' | 'document'

interface TypeRule {
  category: FileCategory
  /** Type MIME de référence, renvoyé dans les en-têtes de diffusion. */
  mime: string
  /** Variantes annoncées par les navigateurs et les systèmes. */
  aliases: string[]
  /** Signatures compatibles. Vide : pas de signature fiable pour ce format. */
  signatures: Signature[]
}

type Signature =
  | 'mp3'
  | 'wav'
  | 'ogg'
  | 'flac'
  | 'aac'
  | 'mp4'
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'webm'
  | 'pdf'
  | 'text'

export const FILE_TYPES: Record<string, TypeRule> = {
  mp3: { category: 'audio', mime: 'audio/mpeg', aliases: ['audio/mp3', 'audio/mpeg3', 'audio/x-mpeg'], signatures: ['mp3'] },
  wav: { category: 'audio', mime: 'audio/wav', aliases: ['audio/x-wav', 'audio/wave', 'audio/vnd.wave'], signatures: ['wav'] },
  ogg: { category: 'audio', mime: 'audio/ogg', aliases: ['application/ogg', 'audio/vorbis', 'audio/opus'], signatures: ['ogg'] },
  oga: { category: 'audio', mime: 'audio/ogg', aliases: [], signatures: ['ogg'] },
  flac: { category: 'audio', mime: 'audio/flac', aliases: ['audio/x-flac'], signatures: ['flac'] },
  aac: { category: 'audio', mime: 'audio/aac', aliases: ['audio/x-aac', 'audio/aacp'], signatures: ['aac', 'mp4'] },
  m4a: { category: 'audio', mime: 'audio/mp4', aliases: ['audio/x-m4a', 'audio/m4a', 'audio/aac'], signatures: ['mp4'] },
  jpg: { category: 'image', mime: 'image/jpeg', aliases: ['image/jpg', 'image/pjpeg'], signatures: ['jpeg'] },
  jpeg: { category: 'image', mime: 'image/jpeg', aliases: ['image/jpg', 'image/pjpeg'], signatures: ['jpeg'] },
  png: { category: 'image', mime: 'image/png', aliases: [], signatures: ['png'] },
  webp: { category: 'image', mime: 'image/webp', aliases: [], signatures: ['webp'] },
  gif: { category: 'image', mime: 'image/gif', aliases: [], signatures: ['gif'] },
  mp4: { category: 'video', mime: 'video/mp4', aliases: ['application/mp4'], signatures: ['mp4'] },
  webm: { category: 'video', mime: 'video/webm', aliases: ['audio/webm'], signatures: ['webm'] },
  pdf: { category: 'document', mime: 'application/pdf', aliases: [], signatures: ['pdf'] },
  txt: { category: 'document', mime: 'text/plain', aliases: [], signatures: ['text'] },
}

export const ACCEPTED_EXTENSIONS = Object.keys(FILE_TYPES)

/** Valeur de l'attribut `accept` d'un champ de fichier. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',')

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

/** Reconnaît le format d'après les premiers octets (16 suffisent, 4 096 conseillés). */
export function detectSignature(bytes: Uint8Array): Signature | null {
  if (bytes.length < 4) return bytes.length > 0 && isText(bytes) ? 'text' : null

  if (ascii(bytes, 0, 4) === 'RIFF' && bytes.length >= 12) {
    const kind = ascii(bytes, 8, 4)
    if (kind === 'WAVE') return 'wav'
    if (kind === 'WEBP') return 'webp'
  }
  if (ascii(bytes, 0, 4) === 'OggS') return 'ogg'
  if (ascii(bytes, 0, 4) === 'fLaC') return 'flac'
  if (ascii(bytes, 0, 3) === 'ID3') return 'mp3'
  if (bytes.length >= 8 && ascii(bytes, 4, 4) === 'ftyp') return 'mp4'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'png'
  if (ascii(bytes, 0, 4) === 'GIF8') return 'gif'
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm'
  if (ascii(bytes, 0, 4) === '%PDF') return 'pdf'

  // Trame MPEG sans étiquette ID3 : 11 bits de synchronisation.
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    // Couche 00 : ADTS, l'enveloppe des fichiers AAC bruts.
    return (bytes[1] & 0x06) === 0 ? 'aac' : 'mp3'
  }

  return isText(bytes) ? 'text' : null
}

/**
 * Texte brut : aucun octet nul et un UTF-8 valide. Les premiers octets
 * suffisent à écarter un binaire déguisé, tout en tolérant un caractère
 * multi-octets coupé en fin d'échantillon.
 */
function isText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, trimIncomplete(bytes)))
    return true
  } catch {
    return false
  }
}

function trimIncomplete(bytes: Uint8Array): number {
  let end = bytes.length
  // Recule jusqu'au début du dernier caractère s'il est incomplet.
  for (let i = 1; i <= 3 && end - i >= 0; i += 1) {
    const byte = bytes[end - i]
    if ((byte & 0xc0) === 0x80) continue
    const expected = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1
    if (expected > i) end -= i
    break
  }
  return end
}

export function extensionOf(name: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name)
  return match ? match[1].toLowerCase() : ''
}

export function categoryOf(mimeType: string): FileCategory {
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'document'
}

export type TypeCheck =
  | { ok: true; extension: string; mimeType: string; category: FileCategory }
  | { ok: false; reason: string }

/**
 * Vérifie la cohérence entre le nom, le type annoncé et, si fournis, les
 * premiers octets. Le type retenu est toujours celui de la table, jamais
 * celui du client : c'est lui qui part ensuite dans `Content-Type`.
 */
export function checkFileType(
  fileName: string,
  declaredMime: string | null | undefined,
  head?: Uint8Array,
): TypeCheck {
  const extension = extensionOf(fileName)
  const rule = FILE_TYPES[extension]
  if (!rule) {
    return { ok: false, reason: `Extension non acceptée : « .${extension || '?'} ».` }
  }

  const declared = (declaredMime ?? '').split(';')[0].trim().toLowerCase()
  const generic = declared === '' || declared === 'application/octet-stream'
  if (!generic && declared !== rule.mime && !rule.aliases.includes(declared)) {
    return { ok: false, reason: `Le type annoncé (${declared}) ne correspond pas à l'extension .${extension}.` }
  }

  if (head && head.length > 0) {
    const found = detectSignature(head)
    if (!found || !rule.signatures.includes(found)) {
      return { ok: false, reason: `Le contenu du fichier ne correspond pas à un fichier .${extension}.` }
    }
  }

  return { ok: true, extension, mimeType: rule.mime, category: rule.category }
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

/**
 * Nettoie un nom de fichier fourni par le client (CDS 24).
 *
 * Le nom d'origine n'est jamais utilisé comme chemin — le stockage reçoit un
 * nom dérivé de l'identifiant — mais il est affiché, renvoyé dans
 * `Content-Disposition` et recopié dans le Drive : on retire donc tout ce qui
 * pourrait y être interprété (séparateurs, caractères de contrôle, noms
 * réservés de Windows, points de tête qui masqueraient le fichier).
 */
export function sanitizeFileName(input: string): string {
  const base = input.normalize('NFC').split(/[\\/]/).pop() ?? ''
  let name = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim()

  if (RESERVED.test(name)) name = `_${name}`

  const extension = extensionOf(name)
  if (name.length > 180) {
    const stem = name.slice(0, 180 - extension.length - 1)
    name = extension ? `${stem}.${extension}` : stem
  }

  return name || 'fichier'
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  const digits = exponent === 0 || value >= 100 ? 0 : 1
  return `${value.toFixed(digits).replace('.', ',')} ${units[exponent]}`
}
