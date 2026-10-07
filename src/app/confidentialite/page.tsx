import type { Metadata } from 'next'
import Link from 'next/link'

import { CONTACT_EMAIL, LegalPage } from '@/components/marketing/legal-page'
import { getSessionUser } from '@/lib/workspace'

export const metadata: Metadata = {
  title: 'Règles de confidentialité',
  description: 'Quelles données Karaks Storage traite, pourquoi, combien de temps, et ce qu’il fait des données Google.',
}

/**
 * Règles de confidentialité. Chaque affirmation correspond à ce que fait le
 * code : à mettre à jour avec lui, sans quoi la page mentirait.
 */
export default async function PrivacyPage() {
  return (
    <LegalPage
      title="Règles de confidentialité"
      updated="7 octobre 2026"
      signedIn={Boolean(await getSessionUser())}
      intro={
        <p>
          Karaks Storage est un service de stockage et de diffusion de fichiers multimédias, utilisé notamment par l’application Karaks. Cette page dit quelles
          données il traite, pourquoi, et ce qu’il fait des données auxquelles il accède dans Google Drive.
        </p>
      }
    >
      <section>
        <h2>Données traitées</h2>
        <ul>
          <li>
            <strong>Compte</strong> : nom, adresse email, et mot de passe conservé sous forme hachée, jamais en clair. Avec la connexion Google, l’adresse email et le nom
            fournis par Google.
          </li>
          <li>
            <strong>Fichiers</strong> : les fichiers que vous téléversez et leurs métadonnées (nom, taille, type, durée, dimensions, forme d’onde calculée par votre
            navigateur).
          </li>
          <li>
            <strong>Journal d’audit</strong> : pour chaque opération sensible (téléversement, lecture, suppression, connexion, création de lien ou de clé), la date,
            le compte ou la clé concernés, l’adresse IP et le navigateur.
          </li>
          <li>
            <strong>Statistiques</strong> : nombres de requêtes, de lectures, de téléchargements et volume transféré, agrégés par projet et par jour.
          </li>
          <li>
            <strong>Cookies</strong> : un cookie de session pour rester connecté, un cookie retenant le projet choisi, et un cookie temporaire pendant la connexion
            de Google Drive. Aucun cookie publicitaire ni de mesure d’audience. Le thème choisi est retenu dans votre navigateur.
          </li>
        </ul>
      </section>

      <section>
        <h2>Utilisation des données Google</h2>
        <p>
          Lorsque l’administrateur relie Google Drive, Karaks Storage demande l’accès <strong>drive.file</strong> : il ne voit et ne modifie que les fichiers et
          dossiers qu’il a lui-même créés dans ce Drive, rangés sous le dossier « KARAKS STORAGE ». Il n’a accès à aucun autre fichier du compte.
        </p>
        <ul>
          <li>Ces accès servent uniquement à enregistrer, lire, déplacer et supprimer les fichiers téléversés dans Karaks Storage.</li>
          <li>Le jeton d’accès Google est conservé chiffré (AES-256-GCM) et ne quitte jamais le serveur.</li>
          <li>Les liens Google Drive ne sont jamais communiqués aux utilisateurs : les fichiers sont servis par Karaks Storage.</li>
          <li>Aucune donnée Google n’est vendue, ni utilisée à des fins publicitaires, ni transmise à des tiers, ni lue par une personne sauf pour la sécurité ou à votre demande.</li>
        </ul>
        <p>
          L’utilisation et le transfert des informations reçues des API Google respectent la{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            règle relative aux données utilisateur des services d’API Google
          </a>
          , y compris les exigences d’utilisation limitée.
        </p>
      </section>

      <section>
        <h2>Pourquoi ces données</h2>
        <ul>
          <li>Fournir le service : stocker, organiser et diffuser vos fichiers.</li>
          <li>Sécuriser le service : authentification, limitation des abus, journal des opérations sensibles.</li>
          <li>Vous montrer l’usage de vos projets : statistiques et activité récente.</li>
        </ul>
      </section>

      <section>
        <h2>Partage</h2>
        <p>Les données ne sont partagées qu’avec les prestataires techniques qui font fonctionner le service, pour cette seule fin :</p>
        <ul>
          <li>Google Drive, pour le stockage des fichiers ;</li>
          <li>Supabase, pour la base de données (métadonnées, comptes, journal) ;</li>
          <li>Vercel, pour l’hébergement de l’application.</li>
        </ul>
        <p>Un fichier n’est accessible à un tiers que par un lien temporaire créé par un membre du projet, et seulement jusqu’à son expiration ou sa révocation.</p>
      </section>

      <section>
        <h2>Durée de conservation</h2>
        <ul>
          <li>Les fichiers sont conservés jusqu’à leur suppression définitive, ou celle de leur projet.</li>
          <li>La suppression d’un projet efface ses fichiers du stockage, corbeille comprise, ainsi que ses clés, liens, statistiques et journal.</li>
          <li>Les sessions de connexion expirent au bout de 14 jours d’inactivité.</li>
        </ul>
      </section>

      <section>
        <h2>Vos droits</h2>
        <p>
          Vous pouvez demander l’accès à vos données, leur rectification ou leur suppression, et retirer à tout moment l’accès de Karaks Storage à Google Drive
          depuis{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            les autorisations de votre compte Google
          </a>
          . Pour toute demande : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>

      <section>
        <h2>Sécurité</h2>
        <p>
          Connexions chiffrées (HTTPS), mots de passe hachés, clés API et jetons de liens conservés sous forme d’empreinte, contrôle du contenu réel de chaque fichier
          téléversé, permissions par projet et journal d’audit.
        </p>
      </section>

      <p className="border-t border-line pt-6 text-sm">
        Voir aussi les <Link href="/conditions">conditions d’utilisation</Link>.
      </p>
    </LegalPage>
  )
}
