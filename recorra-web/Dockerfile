# ============================================================
# Recorrai — Painel (Next.js) — Dockerfile para EasyPanel
# NEXT_PUBLIC_API_URL é embutido no build (variável pública).
# Defina como Build Arg no EasyPanel: https://SEU-DOMINIO-DA-API/api
# ============================================================

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=build /app/.next ./.next
# public/ serve logo, favicon e a fonte. Sem esta linha o Next responde 404 neles.
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
EXPOSE 3001
CMD ["npm", "run", "start"]
