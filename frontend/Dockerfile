# ============================================================
# AULIA CARE - FRONTEND PRODUCTION IMAGE
# ============================================================

# ------------------------------------------------------------
# 1. Build
# ------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json

RUN npm ci

COPY frontend ./frontend

WORKDIR /app/frontend

RUN npm run build


# ------------------------------------------------------------
# 2. Runtime
# ------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist-frontend /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]