-- Campanha: canal específico + envio via template aprovado (canal oficial).
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "channelAccountId" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "templateNome" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "templateParams" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
