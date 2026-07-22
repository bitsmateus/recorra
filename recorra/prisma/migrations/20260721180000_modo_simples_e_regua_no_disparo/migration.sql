-- Modo simples da cobrança automática (faixa de risco opcional).
ALTER TABLE "tenants" ADD COLUMN "usarFaixaRisco" BOOLEAN NOT NULL DEFAULT true;

-- Rastreio: qual régua gerou cada disparo automático.
ALTER TABLE "message_dispatches" ADD COLUMN "ruleId" TEXT;
CREATE INDEX "message_dispatches_tenantId_ruleId_idx" ON "message_dispatches"("tenantId", "ruleId");
