-- Novos tenants começam no modo simples; tenants existentes preservam o valor atual.
ALTER TABLE "tenants" ALTER COLUMN "usarFaixaRisco" SET DEFAULT false;

-- Régua escolhida explicitamente no modo simples.
ALTER TABLE "tenants" ADD COLUMN "reguaPadraoId" TEXT;
CREATE INDEX "tenants_reguaPadraoId_idx" ON "tenants"("reguaPadraoId");
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_reguaPadraoId_fkey"
  FOREIGN KEY ("reguaPadraoId") REFERENCES "dunning_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nome histórico e integridade da régua que originou o disparo.
ALTER TABLE "message_dispatches" ADD COLUMN "ruleNome" TEXT;
UPDATE "message_dispatches" md
SET "ruleNome" = r."nome"
FROM "dunning_rules" r
WHERE md."ruleId" = r."id";
-- A coluna nasceu sem FK na migração anterior; saneia eventual órfão antes de
-- adicionar a restrição para o deploy não falhar em uma base já utilizada.
UPDATE "message_dispatches" md
SET "ruleId" = NULL
WHERE md."ruleId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "dunning_rules" r WHERE r."id" = md."ruleId");
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "dunning_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
