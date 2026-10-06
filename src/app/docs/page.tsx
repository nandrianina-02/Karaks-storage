import { FileJson, KeyRound, ShieldCheck, Smartphone } from 'lucide-react'
import type { Metadata } from 'next'

import { CodeTabs } from '@/components/marketing/code-tabs'
import { PublicShell } from '@/components/marketing/public-shell'
import { Badge } from '@/components/ui/surface'
import { ERRORS, examples, SECTIONS, type Method } from '@/lib/docs/endpoints'
import { appUrl } from '@/lib/env'
import { cn } from '@/lib/utils'
import { getSessionUser } from '@/lib/workspace'

export const metadata: Metadata = {
  title: 'Documentation de l’API',
  description: 'Référence de l’API REST de Karaks Storage : authentification, fichiers, envoi reprenable, diffusion, liens temporaires.',
}

const METHOD_STYLE: Record<Method, string> = {
  GET: 'bg-success-soft text-success',
  POST: 'bg-accent-soft text-accent',
  PUT: 'bg-warning-soft text-warning',
  PATCH: 'bg-warning-soft text-warning',
  DELETE: 'bg-danger-soft text-danger',
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-line bg-bg p-4 font-mono text-[0.74rem] leading-relaxed text-ink-2">
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  )
}

/** Documentation de l'API (CDS 6.5), publique. */
export default async function DocsPage() {
  const signedIn = Boolean(await getSessionUser())

  return (
    <PublicShell signedIn={signedIn}>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="Sommaire">
          <div className="sticky top-24 space-y-5 text-sm">
            <div>
              <p className="mb-2 text-xs font-medium tracking-wider text-muted uppercase">Démarrer</p>
              <ul className="space-y-1.5">
                {[
                  ['#authentification', 'Authentification'],
                  ['#integration', 'Intégrer Karaks'],
                  ['#erreurs', 'Erreurs et limites'],
                ].map(([href, label]) => (
                  <li key={href}>
                    <a href={href} className="text-ink-2 hover:text-ink">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            {SECTIONS.map((section) => (
              <div key={section.id}>
                <a href={`#${section.id}`} className="mb-2 block text-xs font-medium tracking-wider text-muted uppercase hover:text-ink">
                  {section.title}
                </a>
                <ul className="space-y-1.5">
                  {section.endpoints.map((endpoint) => (
                    <li key={endpoint.id}>
                      <a href={`#${endpoint.id}`} className="text-ink-2 hover:text-ink">
                        {endpoint.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0 space-y-14">
          <section className="animate-rise">
            <p className="text-xs font-medium tracking-[0.25em] text-accent uppercase">API REST v1</p>
            <h1 className="mt-2 font-display text-[2.2rem] leading-tight font-semibold text-ink">Documentation de l’API</h1>
            <p className="mt-3 max-w-2xl leading-relaxed text-ink-2">
              Toutes les réponses sont en JSON. Les identifiants sont préfixés selon leur nature : <code className="font-mono text-ink">prj_</code>,{' '}
              <code className="font-mono text-ink">fld_</code>, <code className="font-mono text-ink">file_</code>, <code className="font-mono text-ink">upl_</code>. Les
              identifiants du fournisseur de stockage ne sont jamais exposés.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <span className="rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[0.8rem] text-ink">{appUrl}/api/v1</span>
              <a href="/api/v1/openapi.json" className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-ink-2 hover:text-ink">
                <FileJson className="h-4 w-4" />
                Description OpenAPI 3.1
              </a>
            </div>
          </section>

          <section id="authentification" className="scroll-mt-24 space-y-4">
            <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold text-ink">
              <KeyRound className="h-5 w-5 text-accent" />
              Authentification
            </h2>
            <p className="max-w-2xl leading-relaxed text-ink-2">
              Chaque requête porte une clé API du projet, créée depuis la page API Keys. La clé n’est affichée qu’à sa création et ne vaut que pour son projet, avec les
              permissions choisies.
            </p>
            <Json value={'Authorization: Bearer ks_live_7Hq2…'} />
          </section>

          <section id="integration" className="scroll-mt-24 space-y-4">
            <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold text-ink">
              <Smartphone className="h-5 w-5 text-accent" />
              Intégrer Karaks (web et Android)
            </h2>
            <ol className="max-w-2xl list-decimal space-y-2 pl-5 leading-relaxed text-ink-2">
              <li>La base de Karaks garde, pour chaque chanson, l’identifiant du fichier : storageFileId, coverFileId.</li>
              <li>Le serveur de Karaks appelle l’API avec sa clé et demande un lien temporaire de lecture.</li>
              <li>Il remet ce lien au lecteur web ou Android, qui lit le fichier par requêtes de plage. La clé ne quitte jamais le serveur.</li>
              <li>
                Pour l’analyse du signal et le mode hors connexion, ajoutez le domaine de Karaks aux origines autorisées du projet : la réponse porte alors les en-têtes
                CORS, dont Content-Range.
              </li>
            </ol>
            <Json value={{ id: 'song_001', title: 'Chanson', artist: 'Artiste', storageFileId: 'file_92kdLq0aZt7x', coverFileId: 'file_91kdPm3sQw8e' }} />
          </section>

          <section id="erreurs" className="scroll-mt-24 space-y-4">
            <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold text-ink">
              <ShieldCheck className="h-5 w-5 text-accent" />
              Erreurs et limites
            </h2>
            <p className="max-w-2xl leading-relaxed text-ink-2">
              Une erreur a toujours la même forme, avec un code stable à tester plutôt que le message. Les limites sont fixées par projet : 100 requêtes par minute et 30
              liens créés par minute par défaut.
            </p>
            <Json value={{ success: false, error: { code: 'forbidden', message: 'Permission manquante : files:delete.', details: { missing: ['files:delete'] } } }} />
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[520px] text-left text-[0.84rem]">
                <tbody>
                  {ERRORS.map((item) => (
                    <tr key={item.code} className="border-b border-line last:border-b-0">
                      <td className="w-16 py-2.5 pl-4 font-mono text-ink tabular-nums">{item.status}</td>
                      <td className="w-56 py-2.5 font-mono text-[0.78rem] text-ink-2">{item.code}</td>
                      <td className="py-2.5 pr-4 text-ink-2">{item.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24 space-y-8">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">{section.title}</h2>
                <p className="mt-2 max-w-2xl leading-relaxed text-ink-2">{section.intro}</p>
              </div>
              {section.endpoints.map((endpoint) => (
                <article key={endpoint.id} id={endpoint.id} className="grid scroll-mt-24 gap-5 border-t border-line pt-6 xl:grid-cols-2">
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold text-ink">{endpoint.title}</h3>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-md px-2 py-0.5 font-mono text-[0.72rem] font-semibold', METHOD_STYLE[endpoint.method])}>{endpoint.method}</span>
                      <code className="font-mono text-[0.84rem] break-all text-ink">{endpoint.path}</code>
                    </p>
                    <p className="text-sm leading-relaxed text-ink-2">{endpoint.description}</p>
                    {endpoint.permission && (
                      <p className="flex items-center gap-2 text-xs text-muted">
                        Permission requise <Badge>{endpoint.permission}</Badge>
                      </p>
                    )}
                    {(endpoint.params?.length || endpoint.body?.fields?.length) && (
                      <dl className="divide-y divide-line rounded-lg border border-line text-[0.82rem]">
                        {[...(endpoint.params ?? []), ...(endpoint.body?.fields ?? []).map((field) => ({ ...field, in: 'corps' }))].map((param) => (
                          <div key={param.name} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3 px-3 py-2">
                            <dt className="font-mono text-[0.76rem] text-ink">
                              {param.name}
                              <span className="block font-sans text-[0.68rem] text-muted">{param.in}</span>
                            </dt>
                            <dd className="text-ink-2">{param.description}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {endpoint.body?.type === 'json' && (
                      <>
                        <p className="text-xs font-medium text-muted">Corps de la requête</p>
                        <Json value={endpoint.body.example} />
                      </>
                    )}
                  </div>
                  <div className="min-w-0 space-y-3">
                    <CodeTabs samples={examples(appUrl, endpoint)} />
                    <p className="text-xs font-medium text-muted">Réponse {endpoint.response.status}</p>
                    <Json value={endpoint.response.example} />
                  </div>
                </article>
              ))}
            </section>
          ))}
        </main>
      </div>
    </PublicShell>
  )
}
