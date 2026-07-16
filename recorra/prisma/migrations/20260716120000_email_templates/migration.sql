-- Modelos de e-mail reutilizáveis por tenant (assunto + corpo com variáveis).
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_templates_tenantId_idx" ON "email_templates"("tenantId");

ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Assunto do e-mail: na campanha (com variáveis) e no disparo (já resolvido).
ALTER TABLE "campaigns" ADD COLUMN "emailAssunto" TEXT;
ALTER TABLE "message_dispatches" ADD COLUMN "assunto" TEXT;
