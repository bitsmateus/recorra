# Recorra — contexto do projeto (backend)

SaaS multi-tenant de régua de cobrança e notificação inteligente. Este diretório (`recorra/`) é o **backend**; o painel fica em `../recorra-web/` (Next.js). Documento de arquitetura completo: `../BLUEPRINT.md`.

## Stack
- NestJS 10 + TypeScript, Prisma 5 + PostgreSQL 16, Redis + BullMQ.
- Auth: Argon2 + JWT (access/refresh com rotação) + RBAC + 2FA (TOTP).
- Multi-tenant: todo dado carrega `tenantId`; RLS no Postgres (`prisma/rls.sql`) como 2ª barreira.
- Credenciais de terceiros (gateways/canais/ERPs) cifradas com AES-256-GCM.

## Estrutura
```
src/
  config/        env (zod), observability (sentry)
  common/        auth (guards/JWT/RBAC/tokens/totp), crypto, prisma, mail, util
  modules/
    auth/        register/login/refresh/google/2FA/verify-email
    users/       convite + onboarding
    customers/   CRUD + segmentacao + tags
    connectors/  IXC, SGP, HubSoft, Voalle, MK-Auth + sync
    payments/    Asaas/MercadoPago/Efi/Stripe + webhook (assinatura HMAC) + conciliacao
    channels/    WhatsApp Cloud/Evolution/uazapi + Email + SMS + templates HSM
    dunning/     regua (janela/anti-spam/fallback/A-B) + nicho-templates + dispatch
    risk/        score de risco (regras) + features
    billing/     assinaturas/recorrencia + acordos (negociacao)
    inbox/       caixa de entrada + chatbot de negociacao
    reports/     funil, ROI, extrato, export CSV
    ingest/      ingestao via API (x-api-key)
    settings/    config de credenciais (cifradas)
    platform/    superadmin + billing do SaaS + planos/anomalia
  queue/         BullMQ (fila de disparos)
  main.ts        API HTTP     |  worker.ts  worker (cron + fila)
```

## Como rodar (dev)
1. `docker compose up -d`  (Postgres + Redis)
2. `npm install`
3. `npm run prisma:migrate` -> `psql "$DATABASE_URL" -f prisma/rls.sql` -> `npm run prisma:seed`
4. `npm run start:dev` (API :3000) + `npm run worker:dev` (worker), com auto-reload.
5. Painel: em `../recorra-web`, `npm run dev` (:3001). Login demo: admin@demo.com / recorra123.

## Convenções / cuidados
- **Dev roda com ts-node-dev** (NÃO tsx): o NestJS precisa de `emitDecoratorMetadata` para DI; esbuild/tsx não emite e quebra a injeção.
- Toda query de negócio filtra por `tenantId`.
- Novos gateways/canais/conectores: implementar a interface e registrar na factory correspondente.
- Testes puros em `test/*.spec.ts` (Vitest). E2e em `test/integration/` (precisa de Postgres).
- Rodar `npm test` antes de commitar.
