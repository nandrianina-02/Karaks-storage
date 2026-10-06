'use client'

/**
 * Métadonnées média relevées dans le navigateur, avant l'envoi.
 *
 * Le navigateur a le fichier en main : il peut en lire la durée, les
 * dimensions et la forme d'onde sans que le serveur ait à décoder quoi que ce
 * soit, ni à relire le fichier depuis Google Drive.
 */
export interface MediaInfo {
  durationSeconds?: number
  width?: number
  height?: number
  waveform?: number[]
}

/** Au-delà, décoder l'audio entier coûterait trop de mémoire à l'onglet. */
const WAVEFORM_MAX_BYTES = 80 * 1024 * 1024
const WAVEFORM_BARS = 96

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))])
}

function mediaElementInfo(file: File, kind: 'audio' | 'video'): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const element = document.createElement(kind)
    element.preload = 'metadata'
    const done = (info: MediaInfo) => {
      URL.revokeObjectURL(url)
      element.removeAttribute('src')
      resolve(info)
    }
    element.onloadedmetadata = () => {
      const info: MediaInfo = {}
      if (Number.isFinite(element.duration)) info.durationSeconds = Math.round(element.duration * 100) / 100
      if (element instanceof HTMLVideoElement && element.videoWidth) {
        info.width = element.videoWidth
        info.height = element.videoHeight
      }
      done(info)
    }
    element.onerror = () => done({})
    element.src = url
  })
}

function imageInfo(file: File): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({})
    }
    image.src = url
  })
}

/**
 * Crêtes du signal en `bars` tranches, ramenées à 0-100 par rapport à la
 * plus forte : la forme reste lisible pour un titre enregistré bas.
 */
export function peaks(channel: Float32Array, bars = WAVEFORM_BARS): number[] {
  const size = Math.max(1, Math.floor(channel.length / bars))
  const values: number[] = []
  for (let bar = 0; bar < bars; bar += 1) {
    let max = 0
    const start = bar * size
    const end = Math.min(channel.length, start + size)
    // Un échantillon sur quatre suffit à trouver la crête d'une tranche.
    for (let i = start; i < end; i += 4) {
      const value = Math.abs(channel[i])
      if (value > max) max = value
    }
    values.push(max)
  }
  const top = Math.max(...values, 1e-6)
  return values.map((value) => Math.max(2, Math.round((value / top) * 100)))
}

async function waveform(file: File): Promise<number[] | undefined> {
  if (file.size > WAVEFORM_MAX_BYTES) return undefined
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return undefined
  const context = new AudioContextClass()
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer())
    return peaks(buffer.getChannelData(0))
  } catch {
    return undefined
  } finally {
    void context.close()
  }
}

export async function readMediaInfo(file: File): Promise<MediaInfo> {
  const type = file.type
  try {
    if (type.startsWith('image/')) return (await withTimeout(imageInfo(file), 8000)) ?? {}
    if (type.startsWith('video/')) return (await withTimeout(mediaElementInfo(file, 'video'), 8000)) ?? {}
    if (type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|flac|aac|m4a)$/i.test(file.name)) {
      const [info, wave] = await Promise.all([
        withTimeout(mediaElementInfo(file, 'audio'), 8000),
        withTimeout(waveform(file), 20000),
      ])
      return { ...(info ?? {}), ...(wave ? { waveform: wave } : {}) }
    }
  } catch {
    // Métadonnées facultatives : leur absence n'empêche pas l'envoi.
  }
  return {}
}
