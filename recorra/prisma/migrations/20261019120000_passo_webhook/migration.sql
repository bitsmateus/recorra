-- Passo de régua "Webhook": avisa um sistema externo (ex.: alerta ao dono da locadora)
-- sem contato com o cliente. A placa da moto vem do sistema de origem (ingestão via API).
ALTER TYPE "ChannelType" ADD VALUE 'WEBHOOK';

ALTER TABLE "invoices" ADD COLUMN "placa" TEXT;
ALTER TABLE "dunning_steps" ADD COLUMN "webhookUrl" TEXT;
ALTER TABLE "message_dispatches" ADD COLUMN "stepId" TEXT, ADD COLUMN "webhookUrl" TEXT;

-- Um aviso por cobrança e passo (NULLs não colidem: disparos comuns não têm stepId).
CREATE UNIQUE INDEX "message_dispatches_invoiceId_stepId_key" ON "message_dispatches"("invoiceId", "stepId");
