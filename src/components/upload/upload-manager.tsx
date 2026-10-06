'use client'

import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useToast } from '@/components/ui/toast'
import { api, ApiClientError, errorMessage } from '@/lib/client/api'
import { readMediaInfo } from '@/lib/client/media'
import { checkFileType } from '@/lib/files/types'

/**
 * Téléversements du tableau de bord (CDS 6.2, 12).
 *
 * Tout passe par une session reprenable, quelle que soit la taille : un seul
 * chemin à maintenir, et la reprise marche aussi pour un fichier moyen sur
 * un réseau mobile. Les envois vivent au niveau de la coque, si bien qu'on
 * peut changer de page sans les interrompre.
 */
export type UploadStatus = 'queued' | 'preparing' | 'uploading' | 'paused' | 'error' | 'done' | 'canceled'

export interface UploadItem {
  key: string
  name: string
  size: number
  folderId: string | null
  folderName: string | null
  project: string
  status: UploadStatus
  received: number
  error?: string
  fileId?: string
  /** Débit lissé, en octets par seconde, pour estimer le temps restant. */
  rate: number
}

interface Internal {
  file: File
  uploadId?: string
  chunkSize: number
  controller?: AbortController
}

interface UploadApi {
  items: UploadItem[]
  add(files: File[], target: { project: string; folderId: string | null; folderName?: string | null }): void
  pause(key: string): void
  resume(key: string): void
  cancel(key: string): void
  clearFinished(): void
}

const UploadContext = createContext<UploadApi | null>(null)

export function useUploads(): UploadApi {
  const context = useContext(UploadContext)
  if (!context) throw new Error('useUploads doit être utilisé dans UploadProvider.')
  return context
}

const CONCURRENCY = 2
const RETRIES = 4

/** Erreurs du client (type refusé, quota) : réessayer ne changerait rien. */
function isFinal(error: unknown) {
  return error instanceof ApiClientError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Annulé', 'AbortError'))
    })
  })
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([])
  const internals = useRef(new Map<string, Internal>())
  const running = useRef(new Set<string>())
  const router = useRouter()
  const toast = useToast()
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemsRef = useRef(items)
  // Synchronisé avant la file d'attente ci-dessous : les effets s'exécutent
  // dans l'ordre, et `run` lit l'état courant par cette référence.
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const update = useCallback((key: string, change: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)))
  }, [])

  /** Un seul rafraîchissement pour une rafale d'envois terminés. */
  const refreshSoon = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => router.refresh(), 600)
  }, [router])

  const run = useCallback(
    async (key: string) => {
      const internal = internals.current.get(key)
      const item = itemsRef.current.find((entry) => entry.key === key)
      if (!internal || !item) return
      running.current.add(key)
      const controller = new AbortController()
      internal.controller = controller
      const { signal } = controller
      const file = internal.file

      try {
        let received = 0
        if (!internal.uploadId) {
          update(key, { status: 'preparing', error: undefined })
          const media = await readMediaInfo(file)
          const created = await api<{ upload: { id: string }; chunkSize: number }>('/api/v1/uploads', {
            method: 'POST',
            project: item.project,
            signal,
            body: { name: file.name, mimeType: file.type, size: file.size, folderId: item.folderId, ...media },
          })
          internal.uploadId = created.upload.id
          internal.chunkSize = created.chunkSize
        } else {
          // Reprise : on demande au service ce qu'il a réellement conservé.
          const status = await api<{ upload: { received: number }; file: { id: string } | null }>(
            `/api/v1/uploads/${internal.uploadId}`,
            { project: item.project, signal },
          )
          if (status.file) {
            update(key, { status: 'done', received: file.size, fileId: status.file.id })
            refreshSoon()
            return
          }
          received = status.upload.received
        }

        update(key, { status: 'uploading', received })
        let attempts = 0
        while (received < file.size) {
          const end = Math.min(received + internal.chunkSize, file.size) - 1
          const started = performance.now()
          try {
            const result = await api<{ upload: { received: number }; file: { id: string } | null }>(
              `/api/v1/uploads/${internal.uploadId}`,
              {
                method: 'PUT',
                project: item.project,
                signal,
                headers: { 'Content-Range': `bytes ${received}-${end}/${file.size}` },
                body: file.slice(received, end + 1),
              },
            )
            attempts = 0
            const sent = result.upload.received - received
            const seconds = (performance.now() - started) / 1000
            const instant = seconds > 0 ? sent / seconds : 0
            received = result.upload.received
            setItems((list) =>
              list.map((entry) =>
                entry.key === key
                  ? { ...entry, received, rate: entry.rate ? entry.rate * 0.6 + instant * 0.4 : instant }
                  : entry,
              ),
            )
            if (result.file) {
              update(key, { status: 'done', received: file.size, fileId: result.file.id })
              refreshSoon()
              return
            }
          } catch (error) {
            if (signal.aborted || isFinal(error) || attempts >= RETRIES) throw error
            attempts += 1
            update(key, { error: `Connexion perdue, nouvelle tentative (${attempts}/${RETRIES})` })
            await wait(1000 * 2 ** (attempts - 1), signal)
            const status = await api<{ upload: { received: number } }>(`/api/v1/uploads/${internal.uploadId}`, {
              project: item.project,
              signal,
            })
            received = status.upload.received
            update(key, { error: undefined, received })
          }
        }
      } catch (error) {
        if (signal.aborted) return
        const message = errorMessage(error)
        update(key, { status: 'error', error: message })
        toast.error(`Échec de l’envoi de ${file.name}`, message)
      } finally {
        running.current.delete(key)
        internal.controller = undefined
      }
    },
    [refreshSoon, toast, update],
  )

  // File d'attente : deux envois à la fois, les suivants attendent leur tour.
  useEffect(() => {
    const active = items.filter((item) => ['preparing', 'uploading'].includes(item.status)).length
    const next = items.filter((item) => item.status === 'queued' && !running.current.has(item.key))
    for (const item of next.slice(0, Math.max(0, CONCURRENCY - active))) {
      void run(item.key)
    }
  }, [items, run])

  // Bilan d'une rafale terminée.
  const announced = useRef(new Set<string>())
  useEffect(() => {
    const done = items.filter((item) => item.status === 'done' && !announced.current.has(item.key))
    if (done.length === 0) return
    for (const item of done) announced.current.add(item.key)
    const pending = items.some((item) => ['queued', 'preparing', 'uploading'].includes(item.status))
    if (!pending) {
      const total = items.filter((item) => item.status === 'done').length
      toast.success(total > 1 ? `${total} fichiers téléversés` : `${done[0].name} téléversé`)
    }
  }, [items, toast])

  const add = useCallback<UploadApi['add']>(
    (files, target) => {
      const accepted: UploadItem[] = []
      for (const file of files) {
        // Contrôle immédiat, par le même code que le serveur : inutile
        // d'ouvrir une session pour un fichier qui sera refusé.
        const check = checkFileType(file.name, file.type)
        if (!check.ok) {
          toast.error(`${file.name} refusé`, check.reason)
          continue
        }
        const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        internals.current.set(key, { file, chunkSize: 4 * 1024 * 1024 })
        accepted.push({
          key,
          name: file.name,
          size: file.size,
          folderId: target.folderId,
          folderName: target.folderName ?? null,
          project: target.project,
          status: 'queued',
          received: 0,
          rate: 0,
        })
      }
      if (accepted.length) setItems((list) => [...list, ...accepted])
    },
    [toast],
  )

  const pause = useCallback(
    (key: string) => {
      internals.current.get(key)?.controller?.abort()
      update(key, { status: 'paused', rate: 0, error: undefined })
    },
    [update],
  )

  const resume = useCallback((key: string) => update(key, { status: 'queued', error: undefined }), [update])

  const cancel = useCallback(
    (key: string) => {
      const internal = internals.current.get(key)
      const item = itemsRef.current.find((entry) => entry.key === key)
      internal?.controller?.abort()
      if (internal?.uploadId && item) {
        void api(`/api/v1/uploads/${internal.uploadId}`, { method: 'DELETE', project: item.project }).catch(() => undefined)
      }
      update(key, { status: 'canceled', rate: 0 })
    },
    [update],
  )

  const clearFinished = useCallback(() => {
    setItems((list) => list.filter((item) => !['done', 'canceled'].includes(item.status)))
  }, [])

  // Quitter la page interrompt les envois : on prévient tant qu'il en reste.
  useEffect(() => {
    const busy = items.some((item) => ['queued', 'preparing', 'uploading'].includes(item.status))
    if (!busy) return
    const onLeave = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [items])

  const value = useMemo(() => ({ items, add, pause, resume, cancel, clearFinished }), [items, add, pause, resume, cancel, clearFinished])
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
}
