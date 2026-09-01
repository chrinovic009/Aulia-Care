# ============================================================
# AULIA CARE - BACKEND PRODUCTION IMAGE
# ============================================================


# ------------------------------------------------------------
# 1. Dependencies
# ------------------------------------------------------------
FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN npm ci


# ------------------------------------------------------------
# 2. Build
# ------------------------------------------------------------
FROM dependencies AS builder

WORKDIR /app

COPY backend ./backend

WORKDIR /app/backend

RUN npx prisma generate --schema prisma/schema.prisma

RUN npm run build


# ------------------------------------------------------------
# 3. Database migration image
# ------------------------------------------------------------
#
# Cette cible contient Prisma CLI et les fichiers de migration.
# Elle sert uniquement à exécuter :
#
#   prisma migrate deploy
#
# Elle n'est jamais utilisée comme serveur applicatif.
#
# ------------------------------------------------------------
FROM dependencies AS migration

WORKDIR /app

COPY backend ./backend

WORKDIR /app/backend

RUN npx prisma generate --schema prisma/schema.prisma

CMD ["npx", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]


# ------------------------------------------------------------
# 4. Remove development dependencies
# ------------------------------------------------------------
FROM builder AS production-dependencies

WORKDIR /app

RUN npm prune --omit=dev


# ------------------------------------------------------------
# 5. Runtime
# ------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=production-dependencies /app/node_modules ./node_modules

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma

WORKDIR /app/backend

EXPOSE 3000

CMD ["node", "dist/main.js"]