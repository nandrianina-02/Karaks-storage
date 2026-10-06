@AGENTS.md

sans utilisation emoji
Design non détectable comme IA mais professionnel
Ajouter des animations à chaques pages qui nécessittent, avec le loading personnalisé pour Karaks Storage
Tous les pages doit correspond au maquette pas l'accueil seulement
Utiliser des icones partout pour rendre la page stylisée et moderne si necessaire

Après la modification fonctionnel , commite et pousse le projet sans me demander

# Karaks Storage

Plateforme de stockage, Media API et diffusion sécurisée. Produit
indépendant : Karaks en est le premier client, Moziik ou d'autres
applications pourront suivre. La spécification de référence est
`docs/Karaks_Storage_Cahier_des_Charges.docx` (citée « CDS » dans le code).

## Principe directeur

Le code métier ne connaît que l'interface `StorageProvider`
(`src/lib/storage/provider.ts`). Google Drive est le premier fournisseur, pas
une dépendance : aucun module hors de `src/lib/storage/` ne doit appeler Drive
ni manipuler sa structure (CDS 29, 41).

## Règles de sécurité

- Aucun identifiant Google Drive ne sort par l'API ni par l'interface : les
  représentations publiques passent toutes par `src/lib/api/serialize.ts`
  (CDS 8, 24).
- Les octets d'un fichier passent par le serveur ; on ne donne jamais de lien
  Drive au client (CDS 1).
- Clés API et jetons de liens : seule leur empreinte HMAC est stockée. Les
  secrets à relire (jeton Google, secrets de webhooks) sont chiffrés en
  AES-256-GCM (`src/lib/security/crypto.ts`).
- Toute entrée client est validée par zod avant de toucher la base.
- Toute route `/api/v1` passe par `authenticate()` puis `ctx.require(...)` :
  pas de contrôle de droits fait à la main dans une route.
- Le type MIME servi vient de la table `FILE_TYPES`, jamais du client, et la
  signature réelle des octets est vérifiée (CDS 10).

## Rendu

- Aucun emoji, nulle part. Les pictogrammes viennent de `lucide-react`.
- Identité propre au service : fond marine, un seul accent bleu. Poppins pour
  les titres et le logotype (continuité avec Karaks), Inter pour l'interface.
- Le dégradé est réservé au logotype. Pas de dégradé en fond, pas d'effet de
  verre, pas d'ombres colorées.
- Les couleurs passent par les jetons de `src/app/globals.css`, jamais en dur.
- Les teintes par type de fichier (audio, image, vidéo, document) sont
  sémantiques : elles disent la nature du fichier, toujours avec une icône.

## Animations

Briques définies dans `src/app/globals.css`, à ne pas réinventer :
`animate-rise` (entrée d'un bloc), `animate-fade` (ligne, message),
`animate-pop` (panneau ancré, dialogue), `stagger-1` à `stagger-6`.
150 à 400 ms, quelques pixels et de l'opacité, jamais de rebond. Jamais
d'animation d'entrée sur un lecteur en cours de lecture.

## Conventions

- Interface, contenu, commentaires et messages d'erreur en français.
- Les commentaires expliquent pourquoi ; citer la section du cahier
  (« CDS 15 ») quand un choix en découle.
- La logique métier va dans `src/lib/` et ne dépend pas des pages.

## Vérifications avant de conclure

`npm run check` — types, lint et tests unitaires. Puis
`node scripts/e2e-api.mjs` sur un serveur lancé, pour le parcours complet.
