-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "esteiraColunaId" TEXT;

-- CreateTable
CREATE TABLE "esteira_colunas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "diaMinimo" INTEGER,
    "cor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "esteira_colunas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "esteira_colunas_tenantId_ordem_idx" ON "esteira_colunas"("tenantId", "ordem");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_esteiraColunaId_fkey" FOREIGN KEY ("esteiraColunaId") REFERENCES "esteira_colunas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esteira_colunas" ADD CONSTRAINT "esteira_colunas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
