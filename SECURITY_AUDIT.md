# SECURITY_AUDIT.md — Recorra (SaaS de cobrança)

> Auditoria white-box defensiva. Data: 2026-07-15. Escopo: `recorra/` (API NestJS) + `recorra-web/` (painel Next.js).
> Método: leitura de código + testes locais. Nada rodado contra produção. Segredos mascarados.
> PoCs automatizados em `recorra/test/security/` (falham hoje, passam após correção).

---

## Status das correções (aplicadas em 2026-07-15)

| Achado | Status | Onde |
|---|---|---|
| R-01/R-04 forja de webhook | ✅ Corrigido | controller reconfirma via `getChargeStatus`; providers *fail-closed* |
| R-02 sync IDOR | ✅ Corrigido | `sync.service`/`connector.factory` escopam por `tenantId` |
| R-05 gateway IDOR | ✅ Corrigido | `gerarCobranca` valida posse; `factory.forAccount(id, tenantId)` |
| R-06 webhook inbound | ✅ Corrigido | verificação por provedor (`inbound-signature.ts`), *fail-closed* |
| R-08 tokens em log | ✅ Corrigido | `mail.service` não loga corpo/token; falha em prod sem provedor |
| R-09 escalada de papel | ✅ Corrigido | só OWNER concede OWNER; sem auto-alteração; protege último OWNER |
| R-12 chave fraca | ✅ Corrigido | `ENCRYPTION_KEY`/`JWT_SECRET` min 32 + recusa placeholder |
| R-13 vazamento de erro | ✅ Parcial | erros de gateway genéricos ao cliente (SSRF exfil segue em R-07) |
| R-14 superadmin | ✅ Corrigido | `/admin/login` 5/min **+ 2FA TOTP** (`PlatformAdmin.twoFa*`, endpoints `/admin/2fa/setup`+`/enable`) — requer `prisma migrate` |
| R-16 opt-out em campanhas | ✅ Corrigido | `campaigns.service` checa `Consent REVOGADO` |
| R-17 guard sem escopo | ✅ Corrigido | `JwtAuthGuard` rejeita token sem `tenantId`/`role` |
| R-18 Google `aud` | ✅ Corrigido | exige `GOOGLE_CLIENT_ID`; recusa se ausente |
| R-19 CSV injection | ✅ Corrigido | `csv.ts` neutraliza `= + - @` |
| **R-03 RLS inócua** | 🟡 Scaffolding pronto (default-off) | plumbing de contexto + policy estrita entregues; **exige validação no seu Postgres antes de ativar** |
| R-07 SSRF | ✅ Corrigido | `common/net/safe-http.ts` bloqueia IP interno (valida IP conectado, anti-rebind) nos 5 conectores + 4 canais de URL do tenant |
| R-10 máquina de estados | ✅ Corrigido | `invoice-status.ts` valida transições; `updateInvoice` bloqueia transição ilegal e edição de valor após emissão no gateway |
| R-11 trilha de auditoria | ✅ Corrigido | `AuditService` grava em ações sensíveis: status/valor/geração/exclusão de fatura, acordos, papéis/ativo de usuário (com `antes`/`depois` e `userId`) |
| R-15 xlsx | ✅ Corrigido (requer `npm install`) | `package.json` aponta `xlsx` para o tarball oficial 0.20.3 (drop-in, sem mudança de código) + limites de tamanho/linhas no import |
| R-20 idempotência webhook | ✅ Corrigido | claim atômico (`updateMany processadoEm null→now`) impede processamento duplicado |
| R-21 teto de desconto | ✅ Corrigido | `agreements.create` rejeita desconto <0% ou >50% |
| R-22 PII em logs | ✅ Corrigido | `nestjs-pino` com `redact` (authorization/x-api-key/senha/token/credentials/twoFaSecret) — retenção segue como config |

PoCs de regressão: `recorra/test/security/` — **todos verdes** após as correções (`npx vitest run`, 110/110).

### Rollout da RLS estrita (R-03) — validar antes de ativar

O código para a RLS valer já existe, **desligado por padrão** (`RLS_ENFORCED` ausente/`false` ⇒ comportamento idêntico ao de hoje):
- `common/prisma/tenant-context.ts` — contexto de tenant por requisição (AsyncLocalStorage).
- `common/prisma/tenant-context.interceptor.ts` — abre 1 transação/request e define `app.current_tenant`.
- `common/prisma/prisma.service.ts` — roteia as queries para essa transação (RLS aplicada) sem alterar os serviços.
- `prisma/rls-strict.sql` — policy estrita (sem o escape permissivo) + `FORCE ROW LEVEL SECURITY`.

Passos (em **staging** primeiro):
1. Crie 2 roles no Postgres: `recorra_api` (sem superuser, RLS aplicada) e `recorra_worker` **com `BYPASSRLS`** (worker e webhooks legitimamente cruzam contexto).
2. Aponte a API para `recorra_api`; worker (`node dist/src/worker.js`) para `recorra_worker`.
3. Trate os caminhos sem JWT no processo API: envolva as escritas do **webhook de pagamento** e do **inbound** em `prisma.withTenant(account.tenantId, …)` — senão a policy estrita bloqueia a baixa de fatura. (Auth/login precisa de acesso global — mantenha via role com bypass ou fora do FORCE.)
4. `psql "$DATABASE_URL" -f prisma/rls-strict.sql`.
5. `RLS_ENFORCED=true` na API. Rode `npm run test:e2e` (sobe Postgres) e valide fluxos-chave.
6. ⚠️ Trade-off a medir: cada request roda dentro de uma transação; chamadas HTTP externas longas (gateway/ERP) seguram a conexão — avalie timeouts/pool.

> **Não validado neste sandbox** (sem Postgres/engine Prisma aqui): a checagem foi `tsc` + unit (110/110). A ativação exige a validação e2e acima na sua máquina/CI.

---

## Sumário executivo (para não-técnico)

O Recorra guarda o dinheiro e os dados dos clientes de cada empresa contratante. A auditoria
encontrou **três problemas que valem uma correção imediata**:

1. **Dá para "confirmar" um pagamento que nunca aconteceu.** No gateway Efí (e em qualquer
   gateway recém-configurado, sem segredo de webhook), qualquer pessoa na internet consegue
   marcar uma fatura como paga. Resultado: o cliente não paga, mas o sistema acha que pagou —
   perda direta de receita e serviço não cortado.
2. **Uma empresa consegue puxar a base de clientes de outra.** Por uma falha de isolamento,
   um cliente do SaaS pode importar todos os clientes, CPFs e faturas de outro cliente para
   dentro da própria conta. É vazamento de dados pessoais entre empresas (risco LGPD grave) e
   também permite usar as credenciais de pagamento/ERP alheias.
3. **O canal de mensagens recebidas não tem tranca.** Dá para, sem senha, marcar faturas de
   terceiros como "contestadas", descadastrar clientes da cobrança e gastar a cota paga de
   WhatsApp da empresa.

Além disso, a "segunda barreira" de isolamento (RLS no banco) **está desligada na prática** —
a documentação diz que protege, mas não protege. E **não existe trilha de auditoria** (o
registro de "quem mudou o quê" nunca é gravado), o que dificulta responder a fraude ou incidente.

**Custo se explorado:** fraude de pagamento (receita perdida por fatura), multa/again LGPD por
vazamento de dados pessoais entre clientes, e perda de confiança do mercado B2B. **Boa notícia:**
os três itens principais têm correção pequena (poucas linhas / um filtro por tenant).

---

## Tabela de achados (ordenada por impacto × facilidade de exploração)

| ID | Sev | Título | Local | Explorável por |
|----|-----|--------|-------|----------------|
| R-01 | 🔴 Crítico | Webhook Efí aceita "pago" forjado (sem verificação) | `payments/providers/efi.provider.ts:87` | Anônimo |
| R-02 | 🔴 Crítico | Sync IDOR: importar base de clientes/faturas de outro tenant | `connectors/sync.service.ts:31,81` | Tenant autenticado |
| R-03 | 🔴 Crítico | RLS inócua (segunda barreira não existe) | `common/prisma/prisma.service.ts:26` + `prisma/rls.sql` | Estrutural (amplifica IDORs) |
| R-04 | 🔴 Alto | Verificação de webhook é *fail-open* sem segredo (Asaas/Stripe/MP) | `payments/providers/asaas.provider.ts:121` | Anônimo |
| R-05 | 🔴 Alto | Gateway IDOR: gerar cobrança com conta de pagamento de outro tenant | `payments/charges.service.ts:38,54` | Tenant autenticado |
| R-06 | 🔴 Alto | Webhook inbound sem autenticação → sabotagem + queima de custo | `inbox/inbound.controller.ts:14` | Anônimo |
| R-07 | 🔴 Alto | SSRF via URLs controladas pelo tenant (canal HTTP genérico) | `channels/providers/http-generic.channel.ts:116` | Tenant autenticado |
| R-08 | 🟠 Médio | Tokens de reset/convite logados em texto (account takeover) | `common/mail/mail.service.ts:16` | Quem tem acesso a logs |
| R-09 | 🟠 Médio | Escalada de privilégio ADMIN → OWNER (mass assignment de `role`) | `users/users.controller.ts:19,32` | ADMIN do tenant |
| R-10 | 🟠 Médio | Máquina de estados da fatura sem validação; edição de valor pós-emissão | `payments/charges.service.ts:262` | FINANCEIRO+ |
| R-11 | 🟠 Médio | Trilha de auditoria inexistente (`AuditLog` nunca escrito) | `prisma/schema.prisma:552` (sem writers) | — |
| R-12 | 🟠 Médio | `ENCRYPTION_KEY` fraca/placeholder aceita | `config/env.ts:17` | Requer dump de banco |
| R-13 | 🟠 Médio | Vazamento de erro upstream ao cliente (canal de exfil do SSRF) | `payments/charges.service.ts:207` | Tenant autenticado |
| R-14 | 🟠 Médio | Login do superadmin sem rate-limit estrito nem 2FA | `platform/platform.controller.ts:14` | Anônimo (brute force) |
| R-15 | 🟠 Médio | `xlsx@0.18.5` (Prototype Pollution + ReDoS) no upload | `imports/import.service.ts:27` | Tenant autenticado |
| R-16 | 🟠 Médio | Campanhas de envio em massa não checam opt-out (LGPD) | `campaigns/campaigns.service.ts` (sem consent) | — (conformidade) |
| R-17 | 🟡 Baixo | `JwtAuthGuard` não valida `scope`/`tenantId` (token de plataforma passa) | `common/auth/jwt-auth.guard.ts:19` | Superadmin |
| R-18 | 🟡 Baixo | Google SSO: `aud` opcional + vínculo automático de conta | `common/auth/google.ts:19` | Limitado |
| R-19 | 🟡 Baixo | CSV/Formula injection na exportação | `reports/csv.ts:3` | Via dado de cliente |
| R-20 | 🟡 Baixo | Idempotência de webhook com corrida (mensagem de confirmação dupla) | `payments/webhook.controller.ts:34` | Anônimo (condição de corrida) |
| R-21 | 🟡 Baixo | Sem teto de negócio no desconto de acordo (até 100%) | `billing/agreements.service.ts:50` | FINANCEIRO+ |
| R-22 | ⚪ Info | PII sem masking em logs (`nestjs-pino` não conectado); sem política de retenção | `main.ts` | — |

**Pontos verificados como corretos:** senhas Argon2id + refresh com rotação/revogação; CORS restrito (não `*`) + Helmet; `where tenantId` presente em customers/invoices/settings/rules/agreements/subscriptions/users; **sem SQL injection** (Prisma parametrizado; único raw é `set_config` bindado); sem command injection/path traversal; sem `dangerouslySetInnerHTML` no painel (React auto-escape); dinheiro em `Decimal`; valor da cobrança vem do servidor; split nunca ultrapassa o total; opt-out respeitado no motor da **régua**; nenhum segredo no histórico git.

---

## Os 3 itens para corrigir HOJE

1. **R-01 + R-04 — Feche a forja de pagamento.** No `webhook.controller`, **sempre** reconfirme
   o status via `provider.getChargeStatus(externalId)` em vez de confiar no `status` do corpo, e
   torne a verificação de assinatura *fail-closed* (recusar quando não há segredo). Isso mata
   R-01 e R-04 de uma vez. *(esforço: médio)*
2. **R-02 + R-05 — Escope por tenant os dois IDORs.** Adicione `tenantId` no `where` ao carregar
   integração (`sync.service` / `connector.factory`) e conta de gateway (`charges.gerarCobranca`
   / `payment-provider.factory`). Duas verificações de posse. *(esforço: trivial)*
3. **R-06 — Trave o webhook inbound.** Valide a assinatura/token do provedor (Meta `X-Hub-
   Signature-256`, Evolution `apikey`, uazapi token) antes de processar; nunca confie no `from`.
   *(esforço: médio)*

> **Esta semana (não é "hoje" só por ser refactor):** R-03 — ativar de fato a RLS
> (envelopar queries em `withTenant` + policy estrita + usuário do banco sem BYPASSRLS). É a rede
> de segurança que hoje não existe e que transformaria os IDORs em não-exploráveis.

---

## Detalhe dos achados

### R-01 · 🔴 Crítico — Webhook Efí aceita "pago" forjado
- **Local:** `recorra/src/modules/payments/providers/efi.provider.ts:87-98`
  ```ts
  parseWebhook(_headers, body) {
    const pix = (body as any).pix?.[0];
    return { valid: true, /* ... */ status: pix ? 'PAGA' : undefined, ... };
  }               // ^^^ valid:true incondicional, headers ignorados
  ```
- **Impacto:** qualquer um marca qualquer fatura como PAGA sem pagar → perda de receita, serviço
  não cortado, mensagem de "pagamento recebido" enviada.
- **Pré-requisitos:** anônimo; precisa do `accountId` (URL de webhook, semi-pública) e do `txid`
  (o próprio cliente conhece o seu).
- **PoC:** `test/security/webhook-forgery.poc.spec.ts` → `[F3-1]`. Requisição:
  ```bash
  curl -X POST https://api/webhooks/EFI/<accountId> \
    -H 'Content-Type: application/json' \
    -d '{"pix":[{"txid":"<txid>","horario":"2026-07-15T10:00:00Z"}]}'
  ```
- **Correção:** validar o webhook Pix da Efí por mTLS do PSP **e/ou** sempre reconfirmar via
  `getChargeStatus(txid)` antes de baixar. Remover `valid:true` fixo.
- **Esforço:** médio.

### R-02 · 🔴 Crítico — Sync IDOR: exfiltrar a base de outro tenant
- **Local:** `connectors/sync.service.ts:31,81` + `connectors/connector.factory.ts:24`
  (`findUnique({ where: { id } })` sem `tenantId`).
- **Impacto:** `POST /api/integracoes/:id/sincronizar` com o `integrationId` da vítima decifra as
  credenciais de ERP dela, busca clientes/faturas no ERP e **grava tudo no tenant do atacante**
  (upserts usam o `tenantId` do chamador). Vazamento de nome/CPF/telefone/e-mail/valores entre
  clientes + uso das credenciais/`urlBase` da vítima (vetor SSRF, R-07).
- **Pré-requisitos:** tenant autenticado + `integrationId` da vítima (cuid; não é segredo — surge
  em URLs, respostas e logs).
- **PoC:** `test/security/tenant-isolation.poc.spec.ts` → `[F2-2]`.
- **Correção:** `findFirstOrThrow({ where: { id, tenantId } })` em `syncAll/syncCustomers/syncInvoices`
  e validar posse no `connector.factory.forIntegration` (receber `tenantId`).
- **Esforço:** trivial.

### R-03 · 🔴 Crítico (estrutural) — RLS não está em vigor
- **Local:** `common/prisma/prisma.service.ts:26` (`withTenant` — **zero call sites**), `prisma/rls.sql:33-42`.
- **Impacto:** `withTenant` nunca é chamado → `app.current_tenant` sempre nulo → a policy é
  permissiva (`IS NULL OR = '' OR ...`) e **libera tudo**. A "segunda barreira" anunciada em
  README/HARDENING/CLAUDE.md não existe; qualquer `where tenantId` esquecido (R-02, R-05) é
  vazamento total sem backstop.
- **Correção:** (a) envelopar leituras/escritas de tenant em `withTenant(tenantId, tx => ...)`;
  (b) policy estrita (remover o `IS NULL OR ''`) + `FORCE ROW LEVEL SECURITY`; (c) usuário do
  banco sem BYPASSRLS. Precisa dos três — (a) sem (b) não protege; (b) sem (a) quebra login/registro.
- **Esforço:** refactor.

### R-04 · 🔴 Alto — Verificação de webhook *fail-open* sem segredo
- **Local:** `asaas.provider.ts:121`, `stripe.provider.ts:80`, `mercadopago.provider.ts:85`
  — os três: `const valid = secret ? verify(...) : true`. Conta recém-criada não tem segredo → forja aceita.
- **Mitigação parcial:** o Mercado Pago é salvo porque seu `parseWebhook` devolve `status:undefined`
  e o controller reconsulta a API; Asaas/Stripe/Efí baixam pelo `status` do corpo, sem reconsulta.
- **PoC:** `test/security/webhook-forgery.poc.spec.ts` → `[F3-2]`.
- **Correção:** *fail-closed* (recusar sem segredo) **e** sempre reconfirmar via `getChargeStatus`
  no controller. Comparação de token do Asaas deve ser timing-safe.
- **Esforço:** médio.

### R-05 · 🔴 Alto — Gateway IDOR: usar conta de pagamento de outro tenant
- **Local:** `charges.service.ts:38,54` + `payment-provider.factory.ts:19` (`accountId` sem `tenantId`).
- **Impacto:** tenant A emite cobrança com as credenciais de gateway do tenant B, com `splits`
  controlados pelo atacante (possível redirecionar fundos). Uso cross-tenant do recurso mais sensível.
- **PoC:** `test/security/tenant-isolation.poc.spec.ts` → `[F2-3]`.
- **Correção:** validar posse — `paymentProviderAccount.findFirst({ where: { id, tenantId } })` em
  `gerarCobranca`/`gerarLote`; checar `tenantId` no `factory.forAccount`.
- **Esforço:** trivial.

### R-06 · 🔴 Alto — Webhook inbound sem autenticação
- **Local:** `inbox/inbound.controller.ts:14` → `inbox/inbox.service.ts:57-115`.
- **Impacto:** `POST /webhooks/inbound/:accountId` público, sem assinatura. Com `from`/`text`
  forjados: `text="não reconheço"` → marca a fatura vencida da vítima como `contestada` (pausa
  cobrança); `text="parar"` → opt-out do cliente; cada inbound dispara ≥1 outbound pago → queima
  de cota/custo (infla a fatura de plataforma).
- **PoC:** `curl -X POST https://api/webhooks/inbound/<accountId> -d '{"from":"<tel_da_vitima>","text":"nao reconheco, ja paguei"}'`
- **Correção:** verificar assinatura/token por provedor (Meta `X-Hub-Signature-256`, Evolution
  `apikey`, uazapi token); não confiar no `from`; rate-limit por `accountId`.
- **Esforço:** médio.

### R-07 · 🔴 Alto — SSRF via URLs do tenant (canal HTTP genérico)
- **Local:** `channels/providers/http-generic.channel.ts:86-117` (método/URL/headers/corpo controlados),
  `connectors/providers/ixc.connector.ts:27`, `channels/providers/whatsapp-evolution.channel.ts:21`.
- **Impacto:** requisição HTTP arbitrária do servidor → `169.254.169.254` (credenciais IAM da cloud),
  serviços internos, painel EasyPanel. Não é cego: resposta vaza via `httpMsgIdPath` e via erro (R-13).
- **Correção:** allowlist de hosts; resolver DNS e **recusar IP privado/loopback/link-local**
  (checar o IP após resolução p/ evitar rebind); não ecoar corpo de destino interno; proxy de egress.
- **Esforço:** médio.

### R-08 · 🟠 Médio — Tokens sensíveis logados em texto
- **Local:** `common/mail/mail.service.ts:15-17` — sem `RESEND_API_KEY`, `logger.warn` grava o HTML
  com o link+token de reset/convite/verificação. Como `NODE_ENV` default é `development` e a chave
  é opcional, um deploy mal configurado grava **tokens de reset de senha** nos logs → account takeover.
- **Correção:** nunca logar corpo/token; em produção, falhar o boot se `RESEND_API_KEY` ausente.
- **Esforço:** trivial.

### R-09 · 🟠 Médio — Escalada ADMIN → OWNER (mass assignment de `role`)
- **Local:** `users/users.controller.ts:19-37` + `users/users.service.ts:25,61`. `invite`/`updateRole`
  liberados p/ ADMIN, aceitam `role` arbitrário. ADMIN pode criar OWNER, se auto-promover, ou
  rebaixar/desativar o OWNER (lockout). DTOs são objetos inline (sem `@IsEnum`).
- **Correção:** só OWNER atribui/gera OWNER; impedir alterar o próprio papel; proteger o último OWNER;
  DTOs com `class-validator` (`@IsEnum(UserRole)`).
- **Esforço:** trivial.

### R-10 · 🟠 Médio — Máquina de estados da fatura sem validação
- **Local:** `payments/charges.service.ts:262-275` (`updateInvoice`). `PUT /api/cobrancas/:id` aceita
  `status` e `valor` livres: transições ilegais (`CANCELADA→PAGA`, `PAGA→PENDENTE`), `valor` alterável
  (inclusive ≤0) após a cobrança já emitida no gateway.
- **Correção:** validar transições permitidas; bloquear alteração de `valor` após `externalId`; auditar (R-11).
- **Esforço:** médio.

### R-11 · 🟠 Médio — Trilha de auditoria inexistente
- **Local:** modelo `AuditLog` (`prisma/schema.prisma:552`) — **nenhuma escrita** no código.
- **Impacto:** impossível investigar fraude interna/incidente ("quem marcou pago? quem virou OWNER?").
  Agrava R-09 e R-10. Contradiz a documentação.
- **Correção:** gravar `AuditLog` (userId, ip, antes/depois) nas ações sensíveis.
- **Esforço:** médio.

### R-12 · 🟠 Médio — `ENCRYPTION_KEY` fraca aceita
- **Local:** `config/env.ts:17` (`min(16)`), `common/crypto/crypto.service.ts:17`. Aceita 16 chars e
  o placeholder do `.env.example`. Se o banco vazar, credenciais de terceiros ficam brute-forçáveis.
- **Correção:** exigir `min(32)`; recusar o placeholder no boot; documentar rotação.
- **Esforço:** trivial.

### R-13 · 🟠 Médio — Vazamento de erro upstream ao cliente
- **Local:** `charges.service.ts:203-207`, `http-generic.channel.ts:119`, `settings.service.ts:51`.
  `throw new BadRequestException(JSON.stringify(e.response?.data))` devolve corpo bruto do gateway/ERP
  — e, no SSRF (R-07), de serviços internos.
- **Correção:** logar no servidor (com request-id); devolver mensagem genérica ao cliente.
- **Esforço:** trivial.

### R-14 · 🟠 Médio — Superadmin sem rate-limit estrito nem 2FA
- **Local:** `platform/platform.controller.ts:14` (só throttle global 120/min); `PlatformAdmin` sem 2FA.
  É o alvo que controla todos os tenants com a proteção de brute-force mais fraca.
- **Correção:** `@Throttle({default:{ttl:60000,limit:5}})` no `/admin/login` + 2FA TOTP obrigatório.
- **Esforço:** trivial (rate limit) / médio (2FA).

### R-15 · 🟠 Médio — `xlsx@0.18.5` vulnerável no upload
- **Local:** `imports/import.service.ts:27,117`. Prototype Pollution (CVE-2023-30533) + ReDoS
  (CVE-2024-22363). A correção **não está no npm** (SheetJS saiu do registro).
- **Correção:** migrar p/ `exceljs`, ou instalar `xlsx` ≥0.20.x da CDN oficial; validar tamanho/linhas.
- **Esforço:** médio.
- **Nota Fase 6:** dos 32 alertas do `npm audit`, só o `xlsx` é alcançável; `multer` (não usado —
  upload é base64), `lodash _.template`, `uuid`, `file-type` não são caminhos reais. Resto é ruído
  transitivo de framework (DoS), resolvível com `npm update @nestjs/* @sentry/node`.

### R-16 · 🟠 Médio — Campanhas em massa não checam opt-out (LGPD)
- **Local:** `campaigns/campaigns.service.ts` — nenhuma referência a `Consent`/opt-out (a **régua**
  respeita em `dunning.service.ts:47`, mas o envio em massa de campanhas não).
- **Correção:** aplicar a mesma checagem de `Consent REVOGADO` antes de cada disparo de campanha.
- **Esforço:** trivial.

### R-17 · 🟡 Baixo — `JwtAuthGuard` não valida `scope`/`tenantId`
- **Local:** `common/auth/jwt-auth.guard.ts:19-27`. Token de plataforma (mesmo `JWT_SECRET`, sem
  `tenantId`) passa; `where:{tenantId:undefined}` no Prisma ignora o filtro → leitura cross-tenant.
  Só explorável por superadmin, mas falta a barreira. **Correção:** rejeitar token sem `tenantId`/`role`.

### R-18 · 🟡 Baixo — Google SSO: `aud` opcional + vínculo automático
- **Local:** `common/auth/google.ts:19`, `auth/auth.service.ts:80-108`. Sem `GOOGLE_CLIENT_ID` a
  audiência não é checada; login Google vincula a conta local por e-mail sem confirmação.
  **Correção:** exigir `GOOGLE_CLIENT_ID` quando SSO ativo; confirmar vínculo.

### R-19 · 🟡 Baixo — CSV/Formula injection na exportação
- **Local:** `reports/csv.ts:3-7`. Não neutraliza células iniciadas por `= + - @`. Nome de cliente
  `=HYPERLINK(...)` vira fórmula no Excel. **Correção:** prefixar essas células com `'`.

### R-20 · 🟡 Baixo — Idempotência de webhook com corrida
- **Local:** `payments/webhook.controller.ts:34-50`. Check-then-act não atômico → dois webhooks
  concorrentes criam disparo de confirmação duplicado (a baixa em si é idempotente). **Correção:**
  usar o insert do `idempotencyKey` único como lock (tratar `P2002`) antes de processar.

### R-21 · 🟡 Baixo — Desconto de acordo sem teto de negócio
- **Local:** `billing/agreements.service.ts:50`. `valorComDesconto` limita a [0,100]% (bom contra
  negativo/>100), mas não há teto de negócio — FINANCEIRO pode dar 100% (perdão total), enquanto o
  limite de 20% só existe no texto do chatbot. **Correção:** teto configurável + auditoria/aprovação.

### R-22 · ⚪ Info — Observabilidade/LGPD
- `nestjs-pino` está nas dependências mas não conectado (sem masking de PII); sem política de
  retenção para `message_dispatches`/`inbox_messages`. **Correção:** conectar pino com request-id +
  redaction; definir retenção.

---

## Como reproduzir os PoCs

```bash
cd recorra
npx vitest run test/security      # 5 testes: falham hoje, passam após as correções R-01/R-04/R-02/R-05
```

Os testes descrevem o **comportamento seguro** (webhook forjado = inválido; operação cross-tenant =
rejeitada). A falha atual é a prova do achado; use-os como teste de regressão ao corrigir.
