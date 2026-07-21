CREATE TYPE "InvoiceCollectionStatus" AS ENUM ('ATIVA', 'LEGADO', 'PAUSADA');

ALTER TABLE "payment_provider_accounts"
ADD COLUMN "importLookbackDays" INTEGER DEFAULT 30;

ALTER TABLE "invoices"
ADD COLUMN "gestaoCobranca" "InvoiceCollectionStatus" NOT NULL DEFAULT 'ATIVA';

CREATE INDEX "invoices_tenantId_gestaoCobranca_idx"
ON "invoices"("tenantId", "gestaoCobranca");
