-- Substitui a carteira fixa em 2 equipes (EQUIPE_1/EQUIPE_2) por carteiras
-- configuráveis por tenant: cada cliente cria quantas quiser, com nome e dia
-- mínimo de atraso próprios. Ninguém tinha atribuído a enum ainda (feature
-- recém-lançada), então a troca é segura sem perda de dado em uso.
CREATE TABLE "carteiras" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "diaMinimo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carteiras_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "carteiras_tenantId_nome_key" ON "carteiras"("tenantId", "nome");
CREATE INDEX "carteiras_tenantId_idx" ON "carteiras"("tenantId");

ALTER TABLE "carteiras" ADD CONSTRAINT "carteiras_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users" ADD COLUMN "carteiraId" TEXT;
CREATE INDEX "users_carteiraId_idx" ON "users"("carteiraId");
ALTER TABLE "users" ADD CONSTRAINT "users_carteiraId_fkey" FOREIGN KEY ("carteiraId") REFERENCES "carteiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users" DROP COLUMN "equipeCobranca";
DROP TYPE "EquipeCobranca";
