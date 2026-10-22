# Déployer Karaks Storage sur Oracle Cloud (offre gratuite)

Pourquoi : chaque octet d'un fichier passe par le serveur (décision 7), à
l'envoi comme à l'écoute. Sur Vercel, ces octets comptent dans le « Fast
Origin Transfer », limité à 10 Go par mois en offre gratuite : Moziik l'a
dépassé en octobre 2026 (12,8 Go envoyés, 7,4 Go écoutés). Une machine
« Always Free » d'Oracle a 10 To de trafic sortant par mois, et reste
allumée en permanence, ce qu'attend le serveur.

Rien ne change pour les données : la base reste sur Supabase, les fichiers
sur Google Drive, les identifiants de fichiers sont les mêmes. Seule
l'adresse du service change.

## 1. Compte et machine

1. Créer un compte sur <https://cloud.oracle.com> (carte demandée pour
   vérifier l'identité, aucun débit sur l'offre gratuite). **Région
   d'origine : France Central (Paris)**, la plus proche de la base Supabase
   (eu-west-3). Elle ne se change plus ensuite.
2. Compute > Instances > Create instance :
   - Image : **Canonical Ubuntu 24.04** ;
   - Shape : **Ampere, VM.Standard.A1.Flex**, 2 OCPU et 12 Go de mémoire
     (le plafond gratuit est de 4 OCPU et 24 Go) ;
   - Networking : laisser créer le réseau, avec une adresse IPv4 publique ;
   - SSH keys : « Generate a key pair » et **télécharger la clé privée**.
   - « Out of capacity » : réessayer plus tard, ou avec 1 OCPU et 6 Go.
3. Ouvrir le web : Networking > Virtual cloud networks > le réseau > Security
   Lists > Default Security List > Add Ingress Rules, deux règles :
   source `0.0.0.0/0`, TCP, ports de destination `80` puis `443`.

## 2. Un nom pour la machine

Sur <https://www.duckdns.org> : se connecter, créer un sous-domaine (par
exemple `karaks-storage`), y mettre l'adresse IP publique de la machine. Le
domaine sera `karaks-storage.duckdns.org`.

## 3. Installer

Depuis le PC, dans PowerShell (adapter le chemin de la clé et l'IP) :

```powershell
ssh -i C:\chemin\cle.key ubuntu@IP_PUBLIQUE
```

Sur la machine :

```bash
git clone https://github.com/nandrianina-02/Karaks-storage.git
```

Depuis le PC, envoyer les variables de production (le fichier `.env.vercel`
de `c:\dev\karaks-storage`) :

```powershell
scp -i C:\chemin\cle.key C:\dev\karaks-storage\.env.vercel ubuntu@IP_PUBLIQUE:~/Karaks-storage/.env.vercel
```

Puis sur la machine :

```bash
cd Karaks-storage
chmod +x deploy/oracle/installer.sh
./deploy/oracle/installer.sh karaks-storage.duckdns.org
rm .env.vercel
```

Le script installe Docker, ouvre les ports 80 et 443 dans le pare-feu de la
machine, écrit `.env.production` (nouvelle adresse, `CRON_SECRET` généré),
construit l'image et démarre trois conteneurs : le service, Caddy
(certificat HTTPS automatique) et la tâche de nuit.

Vérifier : `https://karaks-storage.duckdns.org/api/v1/health` doit répondre.

`API_SECRET` et `ENCRYPTION_KEY` doivent rester ceux de Vercel : le premier
signe les clés d'API (celles de Moziik et de Karaks), le second chiffre la
connexion Google. Les régénérer couperait les deux.

## 4. Basculer

1. Console Google Cloud > Identifiants > le client OAuth : ajouter
   `https://karaks-storage.duckdns.org/api/v1/storage/google/callback` aux URI
   de redirection (utile pour reconnecter ou ajouter un compte Google).
2. Moziik : `KARAKS_STORAGE_URL=https://karaks-storage.duckdns.org` dans les
   variables Vercel du projet, puis redéployer. Pareil pour Karaks s'il
   utilise le service, et dans les `.env.local` des postes de travail.
3. Garder le projet Vercel de Karaks Storage un jour ou deux en secours, puis
   le supprimer (sa tâche planifiée ferait double emploi).

## Ensuite

- Mettre à jour : `cd Karaks-storage && git pull && cd deploy/oracle && sudo docker compose up -d --build`.
- Journaux : `sudo docker compose logs -f nuvora`.
- Migrations de base (quand le schéma change) : avec l'adresse **directe** de
  Supabase (port 5432, pas le pooler), `sudo docker compose run --rm -e DATABASE_URL="…" nuvora npx prisma migrate deploy`.
- Envoi d'e-mails : ajouter les `SMTP_*` dans `.env.production` s'ils
  manquent, puis `sudo docker compose up -d`.
