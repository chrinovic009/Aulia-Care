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
# 3. Remove development dependencies
# ------------------------------------------------------------
FROM builder AS production-dependencies

WORKDIR /app

RUN npm prune --omit=dev


# ------------------------------------------------------------
# 4. Runtime
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