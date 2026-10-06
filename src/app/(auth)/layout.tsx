import { FileLock2, KeyRound, Link2, Radio } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { getSessionUser } from '@/lib/workspace'

const POINTS = [
  { icon: FileLock2, title: 'Stockage privé', text: 'Les fichiers ne sont jamais exposés par une adresse publique du fournisseur.' },
  { icon: Radio, title: 'Diffusion par plages', text: 'Lecture audio et vidéo avec avance rapide, sans téléchargement complet.' },
  { icon: Link2, title: 'Liens temporaires', text: 'Durée, nombre d’utilisations, révocation immédiate.' },
  { icon: KeyRound, title: 'Clés API par projet', text: 'Permissions fines, clé affichée une seule fois et conservée hachée.' },
]

/** Écran partagé : formulaire à gauche, ce que fait le service à droite. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSessionUser()) redirect('/dashboard')

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Accueil de Karaks Storage">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
        <p className="text-xs text-muted">Karaks Storage — stockage, Media API et diffusion sécurisée.</p>
      </div>

      <aside className="relative hidden border-l border-line bg-surface lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div className="max-w-lg">
          <p className="text-xs font-medium tracking-[0.25em] text-accent uppercase">Media API</p>
          <h2 className="mt-3 font-display text-[2.1rem] leading-tight font-semibold text-ink">
            Vos médias, rangés et diffusés par une seule API.
          </h2>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-ink-2">
            Karaks Storage conserve les fichiers de vos applications, les diffuse en lecture continue et ne les confie qu’à des liens que vous contrôlez.
          </p>
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {POINTS.map((point, index) => (
              <li key={point.title} className={`animate-rise flex gap-4 py-4 stagger-${index + 1}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-accent">
                  <point.icon className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{point.title}</p>
                  <p className="mt-0.5 text-[0.84rem] leading-relaxed text-ink-2">{point.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
