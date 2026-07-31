-- Tokens de API: escopos, tipo (tenant/plataforma), expiração e tenant opcional.
ALTER TABLE "api_keys" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "api_keys" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'TENANT';
ALTER TABLE "api_keys" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "api_keys" ADD COLUMN "expiraEm" TIMESTAMP(3);
