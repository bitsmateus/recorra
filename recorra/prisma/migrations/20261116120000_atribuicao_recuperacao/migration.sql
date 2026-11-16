-- CreateEnum
CREATE TYPE "DispatchOrigem" AS ENUM ('REGUA', 'MANUAL', 'CAMPANHA', 'CONFIRMACAO');

-- CreateEnum
CREATE TYPE "RecuperacaoOrigem" AS ENUM ('REGUA', 'MANUAL', 'CAMPANHA', 'SEM_CONTATO');

-- CreateEnum
CREATE TYPE "DistribuicaoModo" AS ENUM ('MANUAL', 'BALANCEADA', 'SEQUENCIAL');

-- AlterTable
ALTER TABLE "carteiras" ADD COLUMN     "distribuicao" "DistribuicaoModo" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "distribuicaoCursor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "channel_accounts" ADD COLUMN     "numero" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "atribuidoEm" TIMESTAMP(3),
ADD COLUMN     "diasAtrasoPagamento" INTEGER,
ADD COLUMN     "recuperadoCarteira" TEXT,
ADD COLUMN     "recuperadoDispatchId" TEXT,
ADD COLUMN     "recuperadoOrigem" "RecuperacaoOrigem",
ADD COLUMN     "recuperadoPorId" TEXT;

-- AlterTable
ALTER TABLE "message_dispatches" ADD COLUMN     "origem" "DispatchOrigem",
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "janelaAtribuicaoDias" INTEGER NOT NULL DEFAULT 7;

-- CreateIndex
CREATE INDEX "invoices_tenantId_pagoEm_idx" ON "invoices"("tenantId", "pagoEm");

-- CreateIndex
CREATE INDEX "invoices_tenantId_recuperadoPorId_pagoEm_idx" ON "invoices"("tenantId", "recuperadoPorId", "pagoEm");

-- CreateIndex
CREATE INDEX "message_dispatches_tenantId_origem_createdAt_idx" ON "message_dispatches"("tenantId", "origem", "createdAt");

-- CreateIndex
CREATE INDEX "message_dispatches_tenantId_userId_createdAt_idx" ON "message_dispatches"("tenantId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recuperadoPorId_fkey" FOREIGN KEY ("recuperadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill da origem dos disparos antigos, pela mesma regra que a tela usava.
-- Envios manuais antigos da esteira ficam como REGUA: até aqui não havia como
-- distingui-los (não guardavam o operador).
UPDATE "message_dispatches" SET "origem" = 'CAMPANHA' WHERE "campaignId" IS NOT NULL;
UPDATE "message_dispatches" SET "origem" = 'REGUA'
  WHERE "origem" IS NULL AND ("ruleId" IS NOT NULL OR "ruleNome" IS NOT NULL);
UPDATE "message_dispatches" SET "origem" = 'CONFIRMACAO'
  WHERE "origem" IS NULL AND "template" = 'confirmacao_pagamento';
