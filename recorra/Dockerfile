# ============================================================
# Recorra — Dockerfile multi-stage (API e Worker no mesmo build)
# No EasyPanel:
#   - Serviço "api"    → comando: node dist/src/main.js
#   - Serviço "worker" → comando: node dist/src/worker.js
# ============================================================

FROM node:20-slim AS base
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
# Aplica migrations pendentes antes de subir a API.
# (No serviço worker, sobrescreva o comando para "node dist/src/worker.js")
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
