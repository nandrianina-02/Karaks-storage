# Lecture par un Worker Cloudflare

## Pourquoi

Chaque écoute fait passer tout le fichier par le serveur : on ne donne jamais
de lien Google Drive au client (CDS 1). Sur Vercel, l'offre gratuite plafonne
ce transfert à 10 Go par mois ; au-delà, le déploiement est désactivé
(`402 DEPLOYMENT_DISABLED`) et plus aucun titre ne se lit. C'est arrivé à
`nuvora-cloud`, puis à `moziik-cloud`.

Cloudflare ne facture pas le transfert. Le Worker `workers/lecture` prend
donc en charge la seule partie lourde, la lecture ; l'application reste sur
Vercel pour tout le reste (téléversements, dossiers, administration).

## Ce qu'il fait

| Requête | Traitement |
|---|---|
| `POST /api/v1/files/:id/signed-url` | Même contrat que l'application. Vérifie la clé API et ses permissions dans la base, puis rend un lien `/l/<jeton>` vers le Worker. |
| `GET` / `HEAD /l/<jeton>` | Sert le fichier par plages, depuis Google Drive. |
| `GET /sante` | `{ "ok": true }`. |
| Tout le reste | Relayé tel quel à `ORIGINE` (l'application). |

Le jeton d'un lien est chiffré (AES-256-GCM, clé dérivée d'`ENCRYPTION_KEY`).
Il porte le fichier à servir, sans ligne en base, et l'identifiant Drive n'y
est pas lisible. La base n'est consultée qu'à l'ouverture d'une lecture, pour
vérifier que le fichier n'a pas été retiré et compter l'écoute. Les plages
suivantes ne la touchent pas.

Restent servis par l'application :
- les liens à usage compté (`maxUses`), qui ont besoin de leur ligne en base ;
- les fichiers d'un fournisseur autre que Google Drive.

Différences avec l'application :
- un lien du Worker ne se révoque pas un par un : il expire à son heure, et
  ne sert plus dès que le fichier est mis à la corbeille ;
- les écoutes ne figurent pas au journal d'audit, seulement dans les
  compteurs du fichier.

## Déployer

Depuis `workers/lecture` :

```bash
npm install
npx wrangler login              # une fois, compte Cloudflare (celui de Mess)
npx wrangler secret put DATABASE_URL          # la même que l'application (Supabase)
npx wrangler secret put API_SECRET            # la même que l'application
npx wrangler secret put ENCRYPTION_KEY        # la même que l'application
npx wrangler secret put GOOGLE_CLIENT_ID      # le même client OAuth que l'application
npx wrangler secret put GOOGLE_CLIENT_SECRET
npm run deploy
```

Les cinq valeurs sont celles du déploiement Vercel qui sert la production
(`moziik-cloud`). Une valeur différente rend les clés API ou les connexions
Drive illisibles. `GOOGLE_REFRESH_TOKEN` n'est utile que si un fournisseur
Drive n'a pas de jeton enregistré en base.

Le Worker répond à `https://karaks-lecture.<sous-domaine>.workers.dev`.
Vérification : `/sante` doit répondre `{"ok":true}`.

## Brancher une application cliente

Remplacer l'adresse de Karaks Storage par celle du Worker. Pour Moziik, c'est
la variable `KARAKS_STORAGE_URL` du projet Vercel, suivie d'un nouveau
déploiement. La clé API ne change pas.

Si `ORIGINE` change (nouvelle adresse de l'application), il faut la modifier
dans `wrangler.jsonc` puis redéployer le Worker.

## Vérifier

```bash
cd workers/lecture && npm run check
```

Les tests contrôlent que le Worker relit bien ce que l'application écrit :
empreinte des clés, jetons Google chiffrés.
