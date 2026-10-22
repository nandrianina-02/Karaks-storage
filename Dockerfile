# Karaks Storage sur un serveur permanent (Oracle Cloud, ou toute machine
# avec Docker). Voir docs/DEPLOIEMENT_ORACLE.md.
#
# Aucun secret dans l'image : la construction n'a besoin que de valeurs
# factices pour passer la validation des variables (src/lib/env.ts) ; les
# vraies arrivent au démarrage, par le fichier .env.production.

FROM node:22-bookworm-slim AS construction
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dépendances d'abord : la couche reste en cache tant que le verrou ne change pas.
# `postinstall` lance `prisma generate`, qui a besoin du schéma et de sa configuration.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN DATABASE_URL="postgresql://construction:construction@127.0.0.1:5432/construction" \
    APP_URL="https://construction.invalid" \
    BETTER_AUTH_SECRET="construction-construction-construction-00" \
    API_SECRET="construction-construction-construction-00" \
    ENCRYPTION_KEY="construction-construction-construction-00" \
    npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3200
# Le dossier entier : le CLI Prisma (migrations) et `next start` en ont besoin.
COPY --from=construction --chown=node:node /app ./
USER node
EXPOSE 3200
# Les migrations ne sont pas lancées ici : à travers le pooler de Supabase,
# elles se font à la main, avec l'adresse directe (voir le guide).
CMD ["npm", "run", "start:prod"]
