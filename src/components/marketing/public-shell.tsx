import { BookOpen, LogIn } from 'lucide-react'
import Link from 'next/link'

import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { LinkButton } from '@/components/ui/button'

/** En-tête et pied des pages publiques : accueil et documentation. */
export function PublicShell({ children, signedIn }: { children: React.ReactNode; signedIn: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur-[2px]">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Accueil de Karaks Storage">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-ink-2 md:flex" aria-label="Navigation">
            <Link href="/#fonctionnement" className="hover:text-ink">
              Fonctionnement
            </Link>
            <Link href="/#fonctions" className="hover:text-ink">
              Fonctions
            </Link>
            <Link href="/#securite" className="hover:text-ink">
              Sécurité
            </Link>
            <Link href="/docs" className="hover:text-ink">
              Documentation
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {signedIn ? (
              <LinkButton href="/dashboard" variant="primary">
                Tableau de bord
              </LinkButton>
            ) : (
              <>
                <LinkButton href="/connexion" variant="ghost" icon={<LogIn className="h-4 w-4" />} className="hidden sm:inline-flex">
                  Connexion
                </LinkButton>
                <LinkButton href="/inscription" variant="primary">
                  Créer un compte
                </LinkButton>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-8 text-sm text-ink-2 sm:px-6">
          <Logo compact />
          <span>Karaks Storage — stockage, Media API et diffusion sécurisée.</span>
          <Link href="/docs" className="flex items-center gap-1.5 hover:text-ink sm:ml-auto">
            <BookOpen className="h-4 w-4" />
            Documentation
          </Link>
          <Link href="/api/v1/openapi.json" className="hover:text-ink">
            OpenAPI
          </Link>
          <Link href="/confidentialite" className="hover:text-ink">
            Confidentialité
          </Link>
          <Link href="/conditions" className="hover:text-ink">
            Conditions
          </Link>
        </div>
      </footer>
    </div>
  )
}
