-- Campanha especial "Cobrança automática" (uma por tenant): representa o motor
-- diário e pode ser ligada/pausada. Provisão é feita em código (idempotente).
ALTER TABLE "campaigns" ADD COLUMN "automatico" BOOLEAN NOT NULL DEFAULT false;

-- No máximo uma campanha automática por tenant.
CREATE UNIQUE INDEX "campaigns_tenant_automatico_key" ON "campaigns"("tenantId") WHERE "automatico" = true;
