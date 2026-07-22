-- Reparo de drift: o schema já declarava `plans`, `platform_payment_accounts`,
-- `tenants.planId` e `platform_invoices.asaasPaymentId`, mas nenhuma migração os
-- criava. Sem a coluna `tenants.planId`, qualquer `tenant.update` (que retorna todas
-- as colunas) quebrava com P2022 "column tenants.planId does not exist".
-- Idempotente (IF NOT EXISTS / guardas) para bases já em produção.

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "planId" TEXT;

-- AlterTable
ALTER TABLE "platform_invoices" ADD COLUMN IF NOT EXISTS "asaasPaymentId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "plans" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "preco" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sobConsulta" BOOLEAN NOT NULL DEFAULT false,
    "maxClientes" INTEGER NOT NULL DEFAULT -1,
    "disparosInclusos" INTEGER NOT NULL DEFAULT 0,
    "custoExcedente" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "maxUsuarios" INTEGER NOT NULL DEFAULT -1,
    "features" TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "platform_payment_accounts" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProviderType" NOT NULL DEFAULT 'ASAAS',
    "ambiente" TEXT NOT NULL DEFAULT 'sandbox',
    "credentials" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "platform_invoices_asaasPaymentId_idx" ON "platform_invoices"("asaasPaymentId");

-- AddForeignKey (guardado: só adiciona se ainda não existir)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_planId_fkey') THEN
    ALTER TABLE "tenants" ADD CONSTRAINT "tenants_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
