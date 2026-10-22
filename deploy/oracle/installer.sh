#!/usr/bin/env bash
# Installation de Karaks Storage sur une machine Ubuntu d'Oracle Cloud.
# Usage, depuis la racine du dépôt cloné sur le serveur :
#   ./deploy/oracle/installer.sh mon-nom.duckdns.org
# Prérequis : le fichier .env.vercel copié à la racine du dépôt (voir docs/DEPLOIEMENT_ORACLE.md).
set -euo pipefail

DOMAINE="${1:-}"
if [ -z "$DOMAINE" ]; then
  echo "Indiquer le domaine : ./deploy/oracle/installer.sh mon-nom.duckdns.org" >&2
  exit 1
fi
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RACINE"

echo "1/4 Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

echo "2/4 Pare-feu"
# L'image Ubuntu d'Oracle ferme tout sauf SSH par iptables, en plus de la liste de sécurité du réseau.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 6 -p tcp -m state --state NEW --dport "$port" -j ACCEPT
done
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q iptables-persistent >/dev/null
sudo netfilter-persistent save >/dev/null

echo "3/4 Variables"
if [ ! -f .env.production ]; then
  if [ ! -f .env.vercel ]; then
    echo "Copier d'abord .env.vercel à la racine du dépôt (voir le guide)." >&2
    exit 1
  fi
  # Les variables propres à Vercel sont retirées ; l'adresse devient le nouveau domaine.
  grep -Ev '^(VERCEL|TURBO|NX_)[A-Z_]*=|^APP_URL=|^DATABASE_POOL_MAX=' .env.vercel > .env.production
  {
    echo "APP_URL=\"https://$DOMAINE\""
    # Un serveur permanent garde ses connexions : plus d'une à la fois vers la base.
    echo "DATABASE_POOL_MAX=\"5\""
  } >> .env.production
  grep -q '^CRON_SECRET=' .env.production || echo "CRON_SECRET=\"$(openssl rand -hex 32)\"" >> .env.production
  chmod 600 .env.production
  echo "  .env.production créé (lisible par ce compte seulement)."
else
  echo "  .env.production existe déjà : laissé tel quel."
fi
echo "DOMAINE=$DOMAINE" > deploy/oracle/.env

echo "4/4 Construction et démarrage (quelques minutes la première fois)"
cd deploy/oracle
sudo docker compose up -d --build
echo
echo "Vérifier : https://$DOMAINE/api/v1/health"
