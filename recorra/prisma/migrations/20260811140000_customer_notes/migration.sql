-- Anotação manual de interação com o cliente (ligação, acordo verbal, combinado
-- etc.), acessível tanto do perfil do cliente quanto do card da esteira, sem
-- alterar fatura/cadastro. userId fica NULL se o autor for removido depois.
CREATE TABLE "customer_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_notes_tenantId_customerId_createdAt_idx" ON "customer_notes"("tenantId", "customerId", "createdAt");

ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
