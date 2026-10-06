'use client'

import { ArrowRight, Eye, EyeOff, LogIn, Mail, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { authClient } from '@/lib/auth-client'

/** Libellés français des erreurs de la bibliothèque d'authentification. */
function message(code: string | undefined, fallback: string) {
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'Adresse ou mot de passe incorrect.'
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'Un compte existe déjà avec cette adresse. Connectez-vous.'
    case 'PASSWORD_TOO_SHORT':
      return 'Mot de passe trop court : 10 caractères au moins.'
    case 'INVALID_TOKEN':
      return 'Ce lien n’est plus valable. Demandez-en un nouveau.'
    default:
      return fallback
  }
}

/** Seules les adresses internes sont suivies après connexion. */
function safeRedirect(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard'
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required
        minLength={10}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute top-1/2 right-2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-ink"
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

function GoogleButton({ label }: { label: string }) {
  const params = useSearchParams()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      className="w-full"
      size="lg"
      loading={busy}
      onClick={async () => {
        setBusy(true)
        await authClient.signIn.social({
          provider: 'google',
          callbackURL: safeRedirect(params.get('redirect')),
          errorCallbackURL: '/connexion?erreur=google',
        })
      }}
      icon={
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.7Z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9Z" />
        </svg>
      }
    >
      {label}
    </Button>
  )
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-line" />
      ou
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

export function SignInForm({ google }: { google: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(params.get('erreur') ? 'La connexion avec Google n’a pas abouti.' : null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: failure } = await authClient.signIn.email({ email, password })
    if (failure) {
      setError(failure.status === 429 ? 'Trop de tentatives. Patientez une minute.' : message(failure.code, 'Connexion impossible.'))
      setBusy(false)
      return
    }
    router.push(safeRedirect(params.get('redirect')))
    router.refresh()
  }

  return (
    <div className="animate-rise">
      <h1 className="font-display text-[1.7rem] font-semibold text-ink">Connexion</h1>
      <p className="mt-1.5 text-sm text-ink-2">Accédez à vos projets, fichiers et clés API.</p>

      {google && (
        <>
          <div className="mt-7">
            <GoogleButton label="Continuer avec Google" />
          </div>
          <Divider />
        </>
      )}

      <form onSubmit={submit} className={google ? 'space-y-4' : 'mt-7 space-y-4'}>
        <Field label="Adresse email" htmlFor="email">
          <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </Field>
        <Field label="Mot de passe" htmlFor="password">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <div className="flex justify-end">
          <Link href="/mot-de-passe-oublie" className="text-[0.8rem] text-accent hover:underline">
            Mot de passe oublié
          </Link>
        </div>
        {error && (
          <p role="alert" className="animate-fade rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<LogIn className="h-[18px] w-[18px]" />}>
          Se connecter
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-2">
        Pas encore de compte ?{' '}
        <Link href="/inscription" className="font-medium text-accent hover:underline">
          Créer un compte
        </Link>
      </p>
    </div>
  )
}

export function SignUpForm({ google }: { google: boolean }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: failure } = await authClient.signUp.email({ name, email, password })
    if (failure) {
      setError(failure.status === 429 ? 'Trop de tentatives. Patientez quelques minutes.' : message(failure.code, 'Inscription impossible.'))
      setBusy(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="animate-rise">
      <h1 className="font-display text-[1.7rem] font-semibold text-ink">Créer un compte</h1>
      <p className="mt-1.5 text-sm text-ink-2">Un administrateur vous ouvre ensuite l’accès aux projets.</p>

      {google && (
        <>
          <div className="mt-7">
            <GoogleButton label="S’inscrire avec Google" />
          </div>
          <Divider />
        </>
      )}

      <form onSubmit={submit} className={google ? 'space-y-4' : 'mt-7 space-y-4'}>
        <Field label="Nom" htmlFor="name">
          <Input id="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={80} />
        </Field>
        <Field label="Adresse email" htmlFor="email">
          <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </Field>
        <Field label="Mot de passe" htmlFor="password" hint="10 caractères au moins.">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
        </Field>
        {error && (
          <p role="alert" className="animate-fade rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<UserPlus className="h-[18px] w-[18px]" />}>
          Créer mon compte
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-2">
        Déjà inscrit ?{' '}
        <Link href="/connexion" className="font-medium text-accent hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  )
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    // La réponse est la même que l'adresse existe ou non : le formulaire ne
    // doit pas permettre de deviner quels comptes existent.
    await authClient.requestPasswordReset({ email, redirectTo: '/reinitialiser-mot-de-passe' }).catch(() => undefined)
    setSent(true)
    setBusy(false)
  }

  return (
    <div className="animate-rise">
      <h1 className="font-display text-[1.7rem] font-semibold text-ink">Mot de passe oublié</h1>
      {sent ? (
        <div className="animate-fade mt-6 rounded-xl border border-line bg-surface p-5">
          <Mail className="h-5 w-5 text-accent" />
          <p className="mt-3 text-sm text-ink">Si un compte utilise {email}, un lien de réinitialisation vient d’y être envoyé.</p>
          <p className="mt-1 text-xs text-ink-2">Il est valable une heure. Pensez à regarder dans les indésirables.</p>
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-sm text-ink-2">Indiquez votre adresse : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="Adresse email" htmlFor="email">
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </Field>
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<ArrowRight className="h-[18px] w-[18px]" />}>
              Envoyer le lien
            </Button>
          </form>
        </>
      )}
      <p className="mt-6 text-sm text-ink-2">
        <Link href="/connexion" className="font-medium text-accent hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  )
}

export function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(token ? null : 'Lien incomplet : demandez un nouveau lien.')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    setBusy(true)
    const { error: failure } = await authClient.resetPassword({ newPassword: password, token })
    if (failure) {
      setError(message(failure.code, 'Réinitialisation impossible.'))
      setBusy(false)
      return
    }
    router.push('/connexion')
  }

  return (
    <div className="animate-rise">
      <h1 className="font-display text-[1.7rem] font-semibold text-ink">Nouveau mot de passe</h1>
      <p className="mt-1.5 text-sm text-ink-2">Choisissez un mot de passe d’au moins 10 caractères.</p>
      <form onSubmit={submit} className="mt-7 space-y-4">
        <Field label="Nouveau mot de passe" htmlFor="password">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!token}>
          Enregistrer
        </Button>
      </form>
    </div>
  )
}
