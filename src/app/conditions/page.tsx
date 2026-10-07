import type { Metadata } from 'next'
import Link from 'next/link'

import { CONTACT_EMAIL, LegalPage } from '@/components/marketing/legal-page'
import { getSessionUser } from '@/lib/workspace'

export const metadata: Metadata = {
  title: 'Conditions d’utilisation',
  description: 'Règles d’utilisation du service Karaks Storage.',
}

export default async function TermsPage() {
  return (
    <LegalPage
      title="Conditions d’utilisation"
      updated="7 octobre 2026"
      signedIn={Boolean(await getSessionUser())}
      intro={
        <p>
          Karaks Storage est un service de stockage, de gestion et de diffusion de fichiers multimédias, accessible par un tableau de bord et une API. En créant un
          compte ou en utilisant l’API, vous acceptez les conditions ci-dessous.
        </p>
      }
    >
      <section>
        <h2>Accès au service</h2>
        <ul>
          <li>L’inscription est libre ; l’accès à un projet est ouvert par son administrateur.</li>
          <li>Vous êtes responsable de la confidentialité de votre mot de passe et des clés API de vos projets. Une clé API ne doit jamais figurer dans une application web ou mobile.</li>
          <li>La création de projets est réservée aux administrateurs du service.</li>
        </ul>
      </section>

      <section>
        <h2>Contenus</h2>
        <ul>
          <li>Vous ne téléversez que des fichiers dont vous détenez les droits, ou pour lesquels vous avez l’autorisation des ayants droit.</li>
          <li>
            Sont interdits les contenus illicites, les logiciels malveillants, et les fichiers déguisés : le service vérifie le contenu réel de chaque fichier et
            refuse ceux qui ne correspondent pas à leur type.
          </li>
          <li>Vous restez propriétaire de vos fichiers. Karaks Storage ne les utilise que pour fournir le service.</li>
        </ul>
      </section>

      <section>
        <h2>Utilisation de l’API</h2>
        <ul>
          <li>Les limites de requêtes fixées par projet s’appliquent ; au-delà, l’API répond par une erreur 429.</li>
          <li>Toute tentative de contourner les permissions, les limites ou la protection des fichiers est interdite.</li>
        </ul>
      </section>

      <section>
        <h2>Suspension et suppression</h2>
        <p>
          Un compte peut être suspendu en cas d’abus ou de non-respect de ces conditions. Vous pouvez demander la suppression de votre compte à tout moment ; la
          suppression d’un projet par son propriétaire efface définitivement ses fichiers.
        </p>
      </section>

      <section>
        <h2>Disponibilité et responsabilité</h2>
        <p>
          Le service est fourni tel quel, sans garantie de disponibilité continue. Il repose sur des prestataires (Google Drive, Supabase, Vercel) dont les
          interruptions peuvent l’affecter. Conservez une copie des fichiers importants : Karaks Storage ne peut être tenu responsable d’une perte de données
          résultant d’une panne d’un prestataire ou d’une suppression demandée par un membre du projet.
        </p>
      </section>

      <section>
        <h2>Évolution des conditions</h2>
        <p>Ces conditions peuvent évoluer avec le service. La date de mise à jour figure en haut de cette page.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </section>

      <p className="border-t border-line pt-6 text-sm">
        Voir aussi les <Link href="/confidentialite">règles de confidentialité</Link>.
      </p>
    </LegalPage>
  )
}
