import {
  ArrowRight,
  BookOpen,
  ChartColumn,
  CloudUpload,
  FileLock2,
  FolderTree,
  KeyRound,
  Layers,
  Link2,
  Radio,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Webhook,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { FileIcon } from '@/components/files/file-icon'
import { PublicShell } from '@/components/marketing/public-shell'
import { LinkButton } from '@/components/ui/button'
import { getSessionUser } from '@/lib/workspace'

export const metadata: Metadata = {
  title: { absolute: 'Karaks Storage — stockage, Media API et diffusion sécurisée' },
}

const STEPS = [
  {
    icon: Layers,
    title: 'Créez un projet',
    text: 'Un projet par application : ses fichiers, ses clés, ses réglages et ses statistiques restent séparés.',
  },
  {
    icon: CloudUpload,
    title: 'Téléversez vos médias',
    text: 'Depuis le tableau de bord ou par l’API, avec un envoi reprenable pour les gros fichiers.',
  },
  {
    icon: Radio,
    title: 'Diffusez par l’API',
    text: 'Votre serveur demande un lien temporaire, votre lecteur le lit par plages. Le stockage reste privé.',
  },
]

const FEATURES = [
  { icon: FolderTree, title: 'Gestionnaire de fichiers', text: 'Dossiers, recherche, tri, glisser-déposer, corbeille et restauration.' },
  { icon: RotateCcw, title: 'Envoi reprenable', text: 'Une coupure réseau ne fait pas recommencer : l’envoi repart du dernier morceau reçu.' },
  { icon: Radio, title: 'Lecture par plages', text: 'Réponses 206 pour avancer dans un titre sans le télécharger en entier.' },
  { icon: Link2, title: 'Liens temporaires', text: 'Durée, nombre d’utilisations, distinction lecture et téléchargement, révocation.' },
  { icon: KeyRound, title: 'Clés API et permissions', text: 'Douze permissions fines ; la clé n’est montrée qu’une fois et conservée hachée.' },
  { icon: Webhook, title: 'Webhooks signés', text: 'Votre application est prévenue des téléversements, suppressions et lectures.' },
  { icon: ChartColumn, title: 'Statistiques', text: 'Stockage, bande passante, requêtes, lectures et fichiers les plus utilisés.' },
  { icon: ScrollText, title: 'Journal d’audit', text: 'Chaque opération sensible : qui, quoi, quand, d’où, avec quel résultat.' },
]

const SECURITY = [
  'Les fichiers ne sont jamais servis par une adresse publique du fournisseur de stockage.',
  'Le contenu réel de chaque fichier est vérifié : un exécutable renommé en .mp3 est refusé.',
  'Clés API et jetons de liens : seule leur empreinte est enregistrée.',
  'Le jeton d’accès au stockage est chiffré en base (AES-256-GCM).',
  'CORS limité aux domaines déclarés par projet, limites de débit, protection CSRF.',
]

const ROADMAP = [
  { version: 'Aujourd’hui', items: ['Google Drive', 'API REST v1', 'Liens temporaires', 'Webhooks', 'Statistiques'] },
  { version: 'Ensuite', items: ['Quotas par plan', 'Recherche avancée', 'Supervision', 'Gestion avancée des membres'] },
  { version: 'Plus tard', items: ['Cloudflare R2 et S3', 'Cache et CDN', 'HLS', 'Transcodage audio et vidéo'] },
]

const PREVIEW = [
  { name: 'papaoutai.mp3', size: '8,4 Mo', category: 'audio' as const },
  { name: 'cover-album.webp', size: '420 Ko', category: 'image' as const },
  { name: 'clip-video.mp4', size: '82 Mo', category: 'video' as const },
  { name: 'readme.txt', size: '2 Ko', category: 'document' as const },
]

export default async function HomePage() {
  const signedIn = Boolean(await getSessionUser())

  return (
    <PublicShell signedIn={signedIn}>
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-24">
          <div className="animate-rise">
            <p className="text-xs font-medium tracking-[0.25em] text-accent uppercase">Cloud Storage · Media API · Diffusion sécurisée</p>
            <h1 className="mt-4 font-display text-[2.5rem] leading-[1.1] font-semibold text-ink sm:text-[3.1rem]">
              Le stockage de vos médias, servi par une seule API.
            </h1>
            <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-ink-2">
              Karaks Storage conserve les fichiers de vos applications, les diffuse en lecture continue et ne les confie qu’à des liens que vous contrôlez. Karaks
              l’utilise pour ses instrumentaux, ses pochettes et ses visuels.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href={signedIn ? '/dashboard' : '/inscription'} variant="primary" size="lg">
                {signedIn ? 'Ouvrir le tableau de bord' : 'Créer un compte'}
                <ArrowRight className="h-4 w-4" />
              </LinkButton>
              <LinkButton href="/docs" size="lg" icon={<BookOpen className="h-4 w-4" />}>
                Lire la documentation
              </LinkButton>
            </div>
          </div>

          <div className="animate-rise stagger-2 overflow-hidden rounded-2xl border border-line bg-surface" aria-hidden="true">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm">
              <span className="font-medium text-ink">Fichiers</span>
              <span className="text-muted">/ Karaks Production</span>
            </div>
            <ul>
              {PREVIEW.map((file, index) => (
                <li key={file.name} className={`animate-fade flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 stagger-${index + 3}`}>
                  <FileIcon category={file.category} />
                  <span className="flex-1 text-sm text-ink">{file.name}</span>
                  <span className="text-xs text-ink-2 tabular-nums">{file.size}</span>
                  <span className="hidden text-xs text-success sm:inline">Privé</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line bg-bg p-4">
              <pre className="overflow-x-auto font-mono text-[0.74rem] leading-relaxed text-ink-2">{`POST /api/v1/files/file_92kd/signed-url
{ "type": "stream", "expiresIn": 600, "maxUses": 1 }

201  { "url": "https://storage.karaks.com/s/Ab82Kx9…",
       "expiresAt": "2026-10-06T12:10:00Z" }`}</pre>
            </div>
          </div>
        </div>
      </section>

      <section id="fonctionnement" className="scroll-mt-20 border-b border-line">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-2xl font-semibold text-ink">Fonctionnement</h2>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="bg-bg p-6">
                <span className="font-mono text-xs text-muted">0{index + 1}</span>
                <step.icon className="mt-4 h-6 w-6 text-accent" />
                <p className="mt-3 font-medium text-ink">{step.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="fonctions" className="scroll-mt-20 border-b border-line">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold text-ink">Fonctions principales</h2>
            <p className="max-w-md text-sm text-ink-2">Un tableau de bord complet et la même API pour Karaks web, Karaks Android et vos autres applications.</p>
          </div>
          <div className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="border-t border-line pt-5">
                <feature.icon className="h-5 w-5 text-ink-2" />
                <p className="mt-3 font-medium text-ink">{feature.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="securite" className="scroll-mt-20 border-b border-line">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div>
            <ShieldCheck className="h-7 w-7 text-success" />
            <h2 className="mt-4 font-display text-2xl font-semibold text-ink">Sécurité</h2>
            <p className="mt-3 leading-relaxed text-ink-2">
              Le fournisseur de stockage n’est qu’un endroit où ranger les octets. Tout accès passe par Karaks Storage, qui vérifie, compte et journalise.
            </p>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {SECURITY.map((item) => (
              <li key={item} className="flex gap-3 py-4 text-sm leading-relaxed text-ink">
                <FileLock2 className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-2xl font-semibold text-ink">Plans</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            Le stockage est conçu pour changer de fournisseur sans toucher l’API : Google Drive aujourd’hui, du stockage objet quand le trafic le demandera.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {ROADMAP.map((stage, index) => (
              <div key={stage.version} className={`rounded-xl border p-5 ${index === 0 ? 'border-accent' : 'border-line'}`}>
                <p className={`text-sm font-medium ${index === 0 ? 'text-accent' : 'text-ink'}`}>{stage.version}</p>
                <ul className="mt-3 space-y-2 text-sm text-ink-2">
                  {stage.items.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${index === 0 ? 'bg-accent' : 'bg-line-strong'}`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-16 sm:px-6">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Prêt à brancher votre application ?</h2>
            <p className="mt-2 text-ink-2">Créez un compte ; un administrateur vous ouvre l’accès au projet.</p>
          </div>
          <div className="flex gap-3">
            <LinkButton href={signedIn ? '/dashboard' : '/inscription'} variant="primary" size="lg">
              {signedIn ? 'Tableau de bord' : 'Créer un compte'}
            </LinkButton>
            <Link href="/docs" className="inline-flex h-11 items-center gap-2 px-2 text-sm text-accent hover:underline">
              Documentation
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
