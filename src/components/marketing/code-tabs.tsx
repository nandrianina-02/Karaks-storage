'use client'

import { Check, Copy } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'

import { cn } from '@/lib/utils'

const LANGUAGES = [
  { id: 'curl', label: 'cURL' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'php', label: 'PHP' },
] as const

export type CodeSamples = Record<(typeof LANGUAGES)[number]['id'], string>
type Language = (typeof LANGUAGES)[number]['id']

/**
 * Langage choisi, partagé par tous les exemples de la page et retenu par le
 * navigateur : on ne le rechoisit pas à chaque point d'entrée.
 */
const listeners = new Set<() => void>()

function readLanguage(): Language {
  try {
    const stored = localStorage.getItem('ks-doc-lang')
    return LANGUAGES.some((item) => item.id === stored) ? (stored as Language) : 'curl'
  } catch {
    return 'curl'
  }
}

function writeLanguage(language: Language) {
  try {
    localStorage.setItem('ks-doc-lang', language)
  } catch {
    // Préférence de confort : sans stockage, elle ne survit pas au rechargement.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function CodeTabs({ samples }: { samples: CodeSamples }) {
  const language = useSyncExternalStore(subscribe, readLanguage, () => 'curl' as Language)
  const [copied, setCopied] = useState(false)
  const choose = writeLanguage

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg">
      <div className="flex items-center border-b border-line px-2">
        <div className="flex gap-0.5 overflow-x-auto" role="tablist">
          {LANGUAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={language === item.id}
              onClick={() => choose(item.id)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2.5 text-[0.78rem] transition-colors',
                language === item.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(samples[language])
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[0.74rem] text-muted hover:text-ink"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[0.76rem] leading-relaxed text-ink-2">
        <code>{samples[language]}</code>
      </pre>
    </div>
  )
}
