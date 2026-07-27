-- Índices de leitura da tela de Disparos.
--
-- Os quatro índices antigos não incluíam `createdAt`, que é a ordenação fixa da
-- tela. Resultado: filtrar por status achava as linhas pelo índice e então
-- ordenava TODAS elas para mostrar 20. Os novos fecham em `createdAt`, então o
-- Postgres lê já na ordem certa e para na primeira página. Cada índice antigo é
-- prefixo do novo, então nada que os usava perde desempenho.
--
-- ATENÇÃO em base grande: `CREATE INDEX` trava escrita na tabela enquanto roda.
-- Se `message_dispatches` já tiver milhões de linhas, aplique este bloco à mão
-- com `CREATE INDEX CONCURRENTLY` (fora de transação — o Prisma não permite) e
-- então marque a migration como aplicada com `prisma migrate resolve --applied`.

DROP INDEX IF EXISTS "message_dispatches_tenantId_status_idx";
DROP INDEX IF EXISTS "message_dispatches_tenantId_createdAt_idx";
DROP INDEX IF EXISTS "message_dispatches_tenantId_campaignId_idx";
DROP INDEX IF EXISTS "message_dispatches_tenantId_ruleId_idx";

-- `id` no fim completa a chave da paginação por cursor (createdAt, id): sem ela,
-- disparos criados no mesmo milissegundo embaralham entre páginas.
CREATE INDEX "message_dispatches_tenantId_createdAt_id_idx" ON "message_dispatches"("tenantId", "createdAt", "id");
CREATE INDEX "message_dispatches_tenantId_status_createdAt_idx" ON "message_dispatches"("tenantId", "status", "createdAt");
CREATE INDEX "message_dispatches_tenantId_campaignId_createdAt_idx" ON "message_dispatches"("tenantId", "campaignId", "createdAt");
CREATE INDEX "message_dispatches_tenantId_ruleId_createdAt_idx" ON "message_dispatches"("tenantId", "ruleId", "createdAt");
CREATE INDEX "message_dispatches_tenantId_channelAccountId_createdAt_idx" ON "message_dispatches"("tenantId", "channelAccountId", "createdAt");
CREATE INDEX "message_dispatches_tenantId_customerId_createdAt_idx" ON "message_dispatches"("tenantId", "customerId", "createdAt");

-- Busca por cliente: o filtro é ILIKE '%termo%', que nenhum btree atende — era
-- seq scan em `customers` a cada tecla digitada. pg_trgm indexa trigramas e
-- transforma isso em index scan (eficaz a partir de 3 caracteres).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "customers_nome_idx" ON "customers" USING GIN ("nome" gin_trgm_ops);
CREATE INDEX "customers_telefone_idx" ON "customers" USING GIN ("telefone" gin_trgm_ops);
