# Recorra — Checklist de produção (hardening)

Estado do que já está implementado e o que validar antes de ir ao ar.

## ✅ Implementado

**Segurança**
- Senhas com Argon2id; JWT access curto + refresh com rotação/revogação.
- 2FA (TOTP) e verificação de e-mail.
- RBAC por papel; isolamento multi-tenant + RLS no Postgres (`prisma/rls.sql`).
- Credenciais de terceiros cifradas (AES-256-GCM).
- **Verificação de assinatura de webhooks**: Stripe (HMAC + tolerância anti-replay) e Mercado Pago (x-signature). Asaas/Efí por token.
- **Rate limiting** global (120 req/min) + limite estrito no login (8/min).
- Helmet, CORS restrito, validação de todo input (Zod/class-validator).

**Confiabilidade / escala**
- **Fila BullMQ** para disparos com retentativa (4 tentativas) + backoff exponencial; falha definitiva marcada.
- Conciliação automática (webhook + polling 30 min).
- Health checks: `GET /health` (liveness) e `GET /health/ready` (Postgres + Redis).
- Worker separado da API (dois serviços no EasyPanel).

**Observabilidade**
- Sentry opcional (`SENTRY_DSN`) inicializado em API e worker.
- Logs do Nest; recomendação de `nestjs-pino` para JSON estruturado.
- Detecção de anomalias por tenant (taxa de falha, fila, webhooks).

**CI**
- `.github/workflows/ci.yml`: Postgres+Redis de serviço, `prisma generate` + `migrate deploy` + `rls.sql`, **Vitest (unit + e2e)** e `build`; build do painel.

## 🔲 Validar no seu ambiente (antes do go-live)

1. `npm ci` no `recorra/` e `recorra-web/` (baixa argon2 nativo e engines do Prisma — bloqueados no sandbox, ok na sua máquina/CI).
2. `npm run prisma:migrate` (há vários models novos) → `psql "$DATABASE_URL" -f prisma/rls.sql` → `npm run prisma:seed`.
3. `npm test` (unit + e2e com Postgres) deve passar.
4. Subir `api` e `worker` no EasyPanel (mesmo Dockerfile, comando do worker = `node dist/worker.js`).
5. Configurar no painel de cada gateway o **webhook** apontando para `/webhooks/:provider/:accountId` e salvar o **webhook secret** na conta (campo cifrado) — sem ele a verificação fica desativada.
6. Definir segredos fortes: `JWT_SECRET` (≥32), `ENCRYPTION_KEY` (32 bytes base64). Nunca commitar `.env`.
7. Usuário do banco **sem** superuser/BYPASSRLS (para a RLS valer).
8. Backup automático do Postgres + teste de restore.

## 🔵 Próximos incrementos de robustez

- `nestjs-pino` com request-id e mascaramento de PII nos logs.
- Dead-letter queue dedicada + painel de jobs (Bull Board).
- Métricas Prometheus/Grafana e alertas (as anomalias já existem via API).
- Testes de carga da fila e do disparo.
