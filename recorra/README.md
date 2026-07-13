# Recorra — API

Régua de cobrança e notificação inteligente (SaaS multi-tenant).
Backend **NestJS + Prisma + PostgreSQL + Redis**. Ver `../BLUEPRINT.md` para a visão completa.

## Stack

- **NestJS 10** (API modular) + **Worker** separado (régua diária + fila de disparos)
- **Prisma 5** / **PostgreSQL 16** (isolamento por tenant + RLS)
- **Argon2** (senhas) + **JWT** (access/refresh) + **RBAC**
- **AES-256-GCM** para cifrar credenciais de terceiros (gateways, canais, ERPs)
- Integrações plugáveis: `PaymentProvider`, `MessageChannel`, `SourceConnector`

## Estrutura

```
src/
├── config/            env.ts (validação Zod)
├── common/
│   ├── auth/          guards JWT, RBAC, decorators
│   ├── crypto/        AES-256-GCM (credenciais)
│   ├── prisma/        PrismaService (+ withTenant/RLS)
│   └── util/          normalização (CPF, telefone, moeda)
├── modules/
│   ├── auth/          register / login / refresh
│   ├── customers/     clientes + risco
│   ├── dashboard/     KPIs do mês
│   ├── connectors/    IXC, SGP, HubSoft, Voalle, MK-Auth + sync
│   ├── payments/      Asaas (+ webhook idempotente + geração de cobrança)
│   ├── channels/      WhatsApp Cloud / Evolution / uazapi / E-mail
│   ├── risk/          score de risco (regras, explicável)
│   └── dunning/       motor da régua + processamento da fila
├── worker/            agendador (cron) da régua e da fila
├── main.ts            bootstrap da API
└── worker.ts          bootstrap do worker
```

## Setup local

```bash
# 1. Subir Postgres + Redis
docker compose up -d

# 2. Instalar dependências
npm install

# 3. Configurar ambiente
cp .env.example .env
#   gere segredos:
#   openssl rand -base64 48   → JWT_SECRET
#   openssl rand -base64 32   → ENCRYPTION_KEY

# 4. Migrations + RLS + client
npm run prisma:migrate
psql "$DATABASE_URL" -f prisma/rls.sql
npm run prisma:generate

# 5. Seed (tenant demo + réguas por faixa de risco)
npm run prisma:seed
#   login: admin@demo.com / recorra123

# 6. Rodar (dois processos)
npm run start:dev     # API   → http://localhost:3000
npm run worker:dev    # Worker (régua + fila)
```

## Deploy no EasyPanel

Crie no EasyPanel, a partir deste repositório (build por Dockerfile):

1. **PostgreSQL** (serviço gerenciado) — ative backup automático.
2. **Redis** (serviço gerenciado).
3. Serviço **api** → build pelo `Dockerfile`. Comando padrão já roda `prisma migrate deploy` e sobe a API.
4. Serviço **worker** → mesmo Dockerfile, **sobrescreva o comando** para `node dist/worker.js`.
5. Variáveis de ambiente: copie de `.env.example` (aponte `DATABASE_URL`/`REDIS_URL` para os serviços internos do EasyPanel).
6. Após o primeiro deploy, rode uma vez o `prisma/rls.sql` no banco.

## Endpoints principais (Fase 1)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/register` | Cadastro de empresa (tenant + owner) |
| POST | `/api/auth/login` | Login (JWT) |
| GET | `/api/clientes` | Listar/segmentar (q, tags, plano, uf, valorMin/Max, faixa) |
| POST | `/api/clientes` | Criar cliente manual (valida CPF/CNPJ, telefone, e-mail) |
| PUT | `/api/clientes/:id` | Editar cliente |
| DELETE | `/api/clientes/:id` | Excluir cliente |
| GET | `/api/clientes/tags` | Tags distintas do tenant |
| PATCH | `/api/clientes/:id/tags` | Definir tags |
| GET | `/api/clientes/:id/risco` | Score de risco do cliente |
| POST | `/api/clientes/:id/risco/recalcular` | Recalcular features + score |
| POST | `/api/clientes/risco/recalcular-todos` | Reavaliar todos |
| POST | `/api/clientes/importar/csv` | Importar via CSV (body: `{ csv }`) |
| POST | `/api/clientes/importar/excel` | Importar via Excel (body: `{ xlsx: base64 }`) |
| GET/POST/DELETE | `/api/config/api-keys` | Gerenciar API keys de ingestão |
| POST | `/api/ingest/clientes` | Ingestão externa de clientes (`x-api-key`) |
| POST | `/api/ingest/faturas` | Ingestão externa de faturas (`x-api-key`) |
| POST | `/api/integracoes/:id/sincronizar` | Puxar clientes+faturas do ERP (IXC etc.) |
| GET | `/api/cobrancas` | Listar faturas (?status=, ?customerId=) |
| POST | `/api/cobrancas/:invoiceId/gerar` | Gerar cobrança (Asaas/MP/Efí/Stripe) + split |
| POST | `/api/cobrancas/lote` | Gerar cobranças em lote |
| GET/POST | `/api/assinaturas` | Listar/criar assinatura (recorrência) |
| PATCH | `/api/assinaturas/:id/status` | Ativar/pausar/cancelar |
| POST | `/api/assinaturas/:id/pix-automatico` | Registrar autorização Pix Automático |
| GET/POST | `/api/acordos` | Listar/criar acordo (desconto + parcelamento) |
| PATCH | `/api/acordos/:id/cancelar` | Cancelar acordo |
| GET | `/api/dashboard/resumo` | KPIs do mês |
| GET/POST | `/api/config/gateways` | Listar/cadastrar gateway (Asaas, Mercado Pago) |
| GET/POST | `/api/config/canais` | Listar/cadastrar canal (WhatsApp/E-mail/SMS) |
| GET/POST | `/api/config/integracoes` | Listar/cadastrar integração ERP |
| POST | `/api/config/integracoes/:id/testar` | Testar conexão com o ERP |
| GET | `/api/reguas` | Listar réguas (com passos) |
| POST | `/api/reguas` | Criar régua (fluxo com passos) |
| PUT | `/api/reguas/:id` | Salvar/atualizar o fluxo inteiro |
| DELETE | `/api/reguas/:id` | Excluir régua |
| POST | `/webhooks/:provider/:accountId` | Webhook de pagamento (idempotente, **assinatura verificada**) |
| GET | `/health` | Liveness |
| GET | `/health/ready` | Readiness (Postgres + Redis) |

> **Produção:** rate limiting global + login estrito, verificação HMAC de webhooks (Stripe/MP), fila **BullMQ** com retry/backoff, Sentry opcional. Checklist completo em `HARDENING.md`. CI em `.github/workflows/ci.yml` roda migrations + testes (unit e e2e) + build.

### Superadmin (plataforma — fora do tenant)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/admin/login` | Login do superadmin (token scope `platform`) |
| GET | `/api/admin/metrics` | Métricas agregadas da plataforma |
| GET | `/api/admin/tenants` | Listar tenants + uso |
| POST | `/api/admin/tenants` | Criar tenant (empresa + owner) |
| PATCH | `/api/admin/tenants/:id` | Suspender/ativar e trocar plano |

Seed cria: superadmin `super@recorra.com.br` / `recorra123`.

Credenciais enviadas em `credentials` (objeto) são **cifradas** antes de salvar e nunca retornam nas listagens.

## Como estender

- **Novo gateway** (Mercado Pago, Efí, Stripe): implemente `PaymentProvider` e registre em `payment-provider.factory.ts`.
- **Novo ERP** (origem): implemente `SourceConnector` e registre em `connector.factory.ts`.
- **Novo canal** (SMS): implemente `MessageChannel` e registre em `channel.factory.ts`.

## Segurança — pontos-chave

- Credenciais de terceiros **sempre cifradas** (AES-256-GCM) — nunca em texto puro.
- Isolamento por tenant: `where tenantId` na aplicação + **RLS** como segunda barreira (`prisma/rls.sql`).
- Webhooks com verificação de assinatura/token e idempotência.
- Respeito a opt-out (LGPD) na régua; trilha de auditoria em `AuditLog`.

> Skeleton da Fase 1. Itens marcados como TODO no código (ex.: pausar régua ao confirmar pagamento no worker, SMS, importação CSV via upload) são os próximos incrementos.
