-- Filtros ampliados de público na campanha.
ALTER TABLE "campaigns" ADD COLUMN "filtroDiasAtraso" INTEGER;
ALTER TABLE "campaigns" ADD COLUMN "filtroPlano" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "filtroCidade" TEXT;

-- Segmentos salvos (audiências nomeadas reutilizáveis).
CREATE TABLE "audience_segments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "filtros" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "audience_segments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "audience_segments_tenantId_nome_key" ON "audience_segments"("tenantId", "nome");
CREATE INDEX "audience_segments_tenantId_idx" ON "audience_segments"("tenantId");
ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
