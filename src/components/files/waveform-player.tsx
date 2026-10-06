'use client'

import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn, formatDuration } from '@/lib/utils'

/**
 * Lecteur audio du panneau de détail (maquette : onde, bouton central,
 * barre de lecture).
 *
 * L'onde est celle du fichier, relevée au téléversement : elle se dessine
 * sans relire le fichier, et la partie déjà jouée prend l'accent. Faute
 * d'onde (fichier envoyé par l'API sans elle), une simple barre la remplace.
 */
export function WaveformPlayer({
  src,
  waveform,
  duration: knownDuration,
  className,
}: {
  src: string
  waveform: number[]
  duration: number | null
  className?: string
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(knownDuration ?? 0)
  const [muted, setMuted] = useState(false)
  const [failed, setFailed] = useState(false)

  // Un autre fichier : on repart de zéro.
  const [lastSrc, setLastSrc] = useState(src)
  if (src !== lastSrc) {
    setLastSrc(src)
    setPlaying(false)
    setTime(0)
    setDuration(knownDuration ?? 0)
    setFailed(false)
  }

  useEffect(() => {
    const element = audio.current
    return () => element?.pause()
  }, [src])

  const progress = duration > 0 ? Math.min(1, time / duration) : 0

  function seek(ratio: number) {
    const element = audio.current
    if (!element || !duration) return
    element.currentTime = Math.max(0, Math.min(duration, ratio * duration))
    setTime(element.currentTime)
  }

  async function toggle() {
    const element = audio.current
    if (!element) return
    if (element.paused) {
      try {
        await element.play()
      } catch {
        setFailed(true)
      }
    } else {
      element.pause()
    }
  }

  function fullscreen() {
    const target = audio.current?.closest('[data-player]') as HTMLElement | null
    void target?.requestFullscreen?.()
  }

  const bars = waveform.length > 0 ? waveform : null

  return (
    <div data-player className={cn('overflow-hidden rounded-xl border border-line bg-surface-2', className)}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => Number.isFinite(event.currentTarget.duration) && setDuration(event.currentTarget.duration)}
        onError={() => setFailed(true)}
      />

      <div className="relative h-40 px-4 pt-10 pb-4">
        <span className="absolute top-3 left-3 rounded-md bg-bg/70 px-2 py-0.5 text-[0.75rem] text-ink tabular-nums">
          {formatDuration(duration)}
        </span>
        <div
          className="flex h-full cursor-pointer items-center gap-[2px]"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            seek((event.clientX - box.left) / box.width)
          }}
          role="slider"
          tabIndex={0}
          aria-label="Position de lecture"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${formatDuration(time)} sur ${formatDuration(duration)}`}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') seek(progress + 0.05)
            if (event.key === 'ArrowLeft') seek(progress - 0.05)
          }}
        >
          {bars ? (
            bars.map((value, index) => (
              <span
                key={index}
                className={cn('flex-1 rounded-full', index / bars.length < progress ? 'bg-accent' : 'bg-ink-2/25')}
                style={{ height: `${Math.max(4, value)}%` }}
              />
            ))
          ) : (
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink-2/25">
              <span className="block h-full bg-accent" style={{ width: `${progress * 100}%` }} />
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          className="absolute top-1/2 left-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-ink/20 bg-bg/70 text-ink transition-colors hover:bg-bg/90"
          aria-label={playing ? 'Pause' : 'Lecture'}
        >
          {playing ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" />}
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-line px-3.5 py-2.5">
        <button type="button" onClick={toggle} className="text-ink hover:text-accent" aria-label={playing ? 'Pause' : 'Lecture'}>
          {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
        </button>
        <span className="text-[0.78rem] text-ink-2 tabular-nums">
          {formatDuration(time)} / {formatDuration(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(event) => seek(Number(event.target.value) / 1000)}
          className="h-1 flex-1 cursor-pointer accent-[var(--accent)]"
          aria-label="Avancer dans le titre"
        />
        <button
          type="button"
          onClick={() => {
            if (!audio.current) return
            audio.current.muted = !audio.current.muted
            setMuted(audio.current.muted)
          }}
          className="text-ink-2 hover:text-ink"
          aria-label={muted ? 'Rétablir le son' : 'Couper le son'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button type="button" onClick={fullscreen} className="text-ink-2 hover:text-ink" aria-label="Plein écran">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
      {failed && <p className="border-t border-line px-3.5 py-2 text-xs text-danger">Lecture impossible pour le moment.</p>}
    </div>
  )
}
