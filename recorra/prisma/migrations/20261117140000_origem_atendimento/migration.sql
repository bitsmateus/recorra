-- Origem do atendimento da cobrança (Ligação, Omni...) e quem negociou
ALTER TABLE "invoices" ADD COLUMN "origemAtendimento" TEXT,
ADD COLUMN "negociadoPorId" TEXT,
ADD COLUMN "origemAtendimentoEm" TIMESTAMP(3);

CREATE TABLE "origens_atendimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "origens_atendimento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "origens_atendimento_tenantId_nome_key" ON "origens_atendimento"("tenantId", "nome");
ALTER TABLE "origens_atendimento" ADD CONSTRAINT "origens_atendimento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_negociadoPorId_fkey" FOREIGN KEY ("negociadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
