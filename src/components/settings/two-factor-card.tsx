'use client'

import { Check, Copy, Download, ShieldCheck, ShieldOff, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { Badge, Card, CardHeader } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import { authClient } from '@/lib/auth-client'

/**
 * Double authentification (CDS 17) : un code à six chiffres, produit par une
 * application (Google Authenticator, Microsoft Authenticator, 1Password…),
 * en plus du mot de passe. Recommandée pour tout compte administrateur : un
 * mot de passe volé ne suffit plus à ouvrir le service.
 */
type Step =
  | { kind: 'idle' }
  | { kind: 'password'; action: 'enable' | 'disable' | 'codes' }
  | { kind: 'setup'; qr: string; secret: string; backupCodes: string[] }
  | { kind: 'codes'; backupCodes: string[] }

export function TwoFactorCard({ enabled, hasPassword, admin }: { enabled: boolean; hasPassword: boolean; admin: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setStep({ kind: 'idle' })
    setPassword('')
    setCode('')
    setError(null)
  }

  async function confirmPassword(event: React.FormEvent) {
    event.preventDefault()
    if (step.kind !== 'password') return
    setBusy(true)
    setError(null)
    try {
      if (step.action === 'enable') {
        const { data, error: failure } = await authClient.twoFactor.enable({ password, issuer: 'Karaks Storage', method: 'totp' })
        if (failure || !data || data.method !== 'totp') throw new Error(failure?.code === 'INVALID_PASSWORD' ? 'Mot de passe incorrect.' : failure?.message ?? 'Activation impossible.')
        const secret = new URL(data.totpURI).searchParams.get('secret') ?? ''
        const qr = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
        setStep({ kind: 'setup', qr, secret, backupCodes: data.backupCodes })
      } else if (step.action === 'disable') {
        const { error: failure } = await authClient.twoFactor.disable({ password })
        if (failure) throw new Error(failure.code === 'INVALID_PASSWORD' ? 'Mot de passe incorrect.' : failure.message ?? 'Désactivation impossible.')
        toast.success('Double authentification désactivée')
        close()
        router.refresh()
      } else {
        const { data, error: failure } = await authClient.twoFactor.generateBackupCodes({ password })
        if (failure || !data) throw new Error(failure?.code === 'INVALID_PASSWORD' ? 'Mot de passe incorrect.' : failure?.message ?? 'Génération impossible.')
        setStep({ kind: 'codes', backupCodes: data.backupCodes })
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Opération impossible.')
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: failure } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, '') })
    setBusy(false)
    if (failure) {
      setError('Code incorrect. Vérifiez que l’heure de votre téléphone est juste, puis réessayez.')
      return
    }
    toast.success('Double authentification activée', 'Le code vous sera demandé à chaque connexion.')
    close()
    router.refresh()
  }

  return (
    <Card className="animate-rise stagger-3">
      <CardHeader
        title="Double authentification"
        icon={<ShieldCheck />}
        description="Un code de votre téléphone en plus du mot de passe."
        actions={enabled ? <Badge tone="success">Active</Badge> : <Badge tone={admin ? 'warning' : 'neutral'}>Inactive</Badge>}
      />
      <div className="px-5 pb-5">
        {!hasPassword ? (
          <p className="text-sm text-ink-2">
            Votre compte se connecte avec Google : la double authentification se règle dans votre compte Google, qui la vérifie lui-même.
          </p>
        ) : enabled ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setStep({ kind: 'password', action: 'codes' })}>Nouveaux codes de secours</Button>
            <Button variant="danger-ghost" icon={<ShieldOff className="h-4 w-4" />} onClick={() => setStep({ kind: 'password', action: 'disable' })}>
              Désactiver
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {admin && (
              <p className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Recommandée pour un compte administrateur : il donne accès à tous les fichiers et clés.
              </p>
            )}
            <Button variant="primary" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setStep({ kind: 'password', action: 'enable' })}>
              Activer la double authentification
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={step.kind === 'password'}
        onClose={close}
        size="sm"
        title="Confirmez votre mot de passe"
        description="Cette opération touche à la sécurité de votre compte."
        icon={<ShieldCheck className="h-[18px] w-[18px]" />}
      >
        <form onSubmit={confirmPassword} className="space-y-4">
          <Field label="Mot de passe" htmlFor="tf-password" error={error}>
            <Input id="tf-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required data-autofocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Annuler</Button>
            <Button type="submit" variant={step.kind === 'password' && step.action === 'disable' ? 'danger' : 'primary'} loading={busy}>
              Continuer
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={step.kind === 'setup'} onClose={close} size="lg" title="Activer la double authentification" icon={<ShieldCheck className="h-[18px] w-[18px]" />}>
        {step.kind === 'setup' && (
          <div className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
              {/* QR code produit localement, depuis l'adresse TOTP : rien ne part chez un tiers. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.qr} alt="QR code à scanner avec votre application d’authentification" width={180} height={180} className="rounded-lg bg-white p-1.5" />
              <div className="space-y-3 text-sm text-ink-2">
                <p>
                  <strong className="text-ink">1.</strong> Scannez ce QR code avec votre application d’authentification.
                </p>
                <p>Ou saisissez cette clé à la main :</p>
                <code className="block rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[0.8rem] break-all text-ink">{step.secret}</code>
              </div>
            </div>
            <BackupCodes codes={step.backupCodes} />
            <form onSubmit={verify} className="space-y-3 border-t border-line pt-5">
              <Field label="3. Saisissez le code affiché par l’application" htmlFor="tf-code" error={error}>
                <Input
                  id="tf-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]{6,7}"
                  maxLength={7}
                  required
                  className="max-w-48 text-center font-mono text-lg tracking-[0.3em]"
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button onClick={close}>Annuler</Button>
                <Button type="submit" variant="primary" loading={busy}>
                  Activer
                </Button>
              </div>
            </form>
          </div>
        )}
      </Dialog>

      <Dialog open={step.kind === 'codes'} onClose={close} title="Nouveaux codes de secours" icon={<ShieldCheck className="h-[18px] w-[18px]" />} footer={<Button variant="primary" onClick={close}>Terminé</Button>}>
        {step.kind === 'codes' && <BackupCodes codes={step.backupCodes} renewed />}
      </Dialog>
    </Card>
  )
}

function BackupCodes({ codes, renewed = false }: { codes: string[]; renewed?: boolean }) {
  const [copied, setCopied] = useState(false)
  const text = codes.join('\n')
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        <strong className="text-ink">{renewed ? '' : '2. '}Codes de secours</strong> — chacun ouvre le compte une fois si vous perdez votre téléphone.
        Gardez-les hors ligne.{renewed ? ' Les anciens codes ne fonctionnent plus.' : ''}
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-surface-2 p-3 font-mono text-[0.85rem] text-ink sm:grid-cols-4">
        {codes.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          size="sm"
          icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setCopied(true)
          }}
        >
          {copied ? 'Copiés' : 'Copier'}
        </Button>
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(`Codes de secours Karaks Storage\n\n${text}\n`)}`}
          download="codes-de-secours-karaks-storage.txt"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-[0.8rem] text-ink hover:bg-surface-2"
        >
          <Download className="h-3.5 w-3.5" />
          Télécharger
        </a>
      </div>
    </div>
  )
}
