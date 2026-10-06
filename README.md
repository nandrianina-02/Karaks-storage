# Karaks Storage

Plateforme de stockage, Media API et diffusion sécurisée. Produit
indépendant : Karaks en est le premier client ; Moziik ou d'autres
applications pourront s'y brancher par la même API.

Spécification : `docs/Karaks_Storage_Cahier_des_Charges.docx` (citée « CDS »
dans le code). Choix techniques : `docs/DECISIONS.md`.

```
Karaks web / Android
        │  clé API (côté serveur) ou lien temporaire (côté lecteur)
Karaks Storage  ──  tableau de bord, API REST v1, liens /s/<jeton>
        │  interface StorageProvider
Google Drive (V1)  ·  R2 / S3 plus tard
```

## Démarrer

```bash
npm install
cp .env.example .env          # puis générer les trois secrets (voir le fichier)
npm run db:start              # PostgreSQL local (prisma dev)
npm run db:deploy             # tables
npm run admin:create          # premier compte : super administrateur
npm run dev                   # http://localhost:3200
node scripts/demo-data.mjs    # facultatif : un projet et des fichiers générés
```

Sans Google configuré, les projets sont stockés sur le disque local
(`storage-data/`), ce qui suffit pour développer et tester toute la chaîne.

## Relier Google Drive

1. Dans Google Cloud, avec le compte qui portera le stockage : créer un
   projet, activer **Google Drive API**, configurer l'écran de consentement
   et le **publier** (en mode « Test », Google invalide le jeton au bout de
   7 jours).
2. Créer un identifiant OAuth de type « Application Web », avec les URI de
   redirection :
   - `<APP_URL>/api/v1/storage/google/callback` (Google Drive)
   - `<APP_URL>/api/v1/auth/callback/google` (connexion au tableau de bord)
3. Renseigner `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`, redémarrer.
4. Paramètres > Stockage > **Connecter Google Drive**, avec le compte de
   stockage. Le dossier `KARAKS STORAGE` (avec `projects`, `temporary`,
   `trash`) est créé, et le jeton est enregistré chiffré.

Seul le droit `drive.file` est demandé : l'application ne voit que les
fichiers qu'elle a créés. Conséquence : il faut toujours reconnecter **le
même compte**, sans quoi les fichiers déjà stockés deviennent illisibles —
le service le refuse tant que des projets y sont stockés.

## Intégrer Karaks

1. Créer un projet « Karaks Production » et, dans ses paramètres, déclarer
   l'origine du site de Karaks (CORS) : le vumètre et le mode hors connexion
   lisent les fichiers par script.
2. Créer une clé API avec le préréglage « Application cliente », la garder
   côté serveur de Karaks.
3. Pour chaque chanson, Karaks enregistre `storageFileId` ; pour la lire, son
   serveur demande `POST /api/v1/files/{id}/signed-url` et remet l'adresse au
   lecteur.

La documentation complète est servie sur `/docs`, et la description
OpenAPI 3.1 sur `/api/v1/openapi.json`.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (port 3200) |
| `npm run check` | Types, lint et tests unitaires |
| `node scripts/e2e-api.mjs` | Critères d'acceptation (CDS 39), contre un serveur lancé |
| `node scripts/check-overflow.mjs` | Aucune page ne déborde sur téléphone |
| `node scripts/shoot.mjs /fichiers` | Captures d'écran (variables `THEME`, `WIDTH`) |
| `npm run db:start` / `db:stop` | PostgreSQL local |
| `npm run db:deploy` | Appliquer les migrations |
| `npm run admin:create` | Créer ou promouvoir le super administrateur |

## Déployer

### Vercel et Supabase (offre gratuite)

Vercel fait tourner le code en fonctions éphémères. Le service s'y adapte :

- envoi reprenable par morceaux de 4 Mio, sous la limite de 4,5 Mo par
  requête ; envoi simple limité à 4 Mo (`VERCEL` détecté) ;
- statistiques et webhooks menés à terme après chaque réponse (`after()`),
  sans quoi la fonction gelée les perdrait ;
- lecture et téléchargement plafonnés à 60 s par requête : les lecteurs
  lisent par plages, ce qui reste bien en deçà ;
- région `cdg1` (Paris), au plus près d'une base Supabase à Paris ;
- limitation de débit approximative : chaque instance compte pour elle.

L'offre gratuite de Vercel est réservée à un usage non commercial.

1. Créer un projet Supabase, récupérer l'adresse du pooler en mode
   transaction (port 6543).
2. Créer les tables : `node scripts/db-apply.mjs PRODUCTION_DATABASE_URL`
   (Prisma Migrate reste bloqué derrière ce pooler ; ce script applique les
   mêmes migrations et les inscrit pour Prisma).
3. Importer le dépôt dans Vercel et déclarer les variables (voir
   `.env.example`) : `DATABASE_URL` (pooler, `?pgbouncer=true`),
   `DATABASE_POOL_MAX=3`, `APP_URL` en HTTPS, trois secrets **neufs**,
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
4. Dans Google Cloud, ajouter les URI de redirection de production :
   `<APP_URL>/api/v1/storage/google/callback` et
   `<APP_URL>/api/v1/auth/callback/google`.
5. Créer le super administrateur contre la base de production :
   `DATABASE_URL=<pooler> npm run admin:create`.
6. Paramètres > Stockage > Connecter Google Drive.

### Railway (serveur permanent)

`railway.json` décrit le déploiement : build, `prisma migrate deploy` avant
chaque mise en ligne, `npm run start:prod` sur le port fourni, point de
santé `/api/v1/health`, une seule instance. C'est la cible la plus adaptée
quand le trafic grandit : pas de plafond de durée ni de taille par requête.

`ENCRYPTION_KEY` ne doit plus changer après la connexion de Drive : le jeton
enregistré deviendrait illisible, et il faudrait reconnecter Drive.

## Sécurité, en bref

- Aucun identifiant du fournisseur ne sort par l'API (`src/lib/api/serialize.ts`).
- Clés API et jetons de liens : empreinte HMAC seulement. Jeton Google et
  secrets de webhooks : chiffrés en AES-256-GCM.
- Type MIME, extension et signature réelle des octets sont croisés.
- Écritures par cookie : origine vérifiée (CSRF). CORS par projet.
- Journal d'audit de chaque opération sensible.
