-- CreateEnum
CREATE TYPE "CampaignTipoEnvio" AS ENUM ('REGUA', 'MENSAGEM');

-- CreateEnum
CREATE TYPE "CampaignAgendamento" AS ENUM ('UMA_VEZ', 'MENSAL', 'SEMPRE_ATIVA');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('RASCUNHO', 'ATIVA', 'PAUSADA', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipoEnvio" "CampaignTipoEnvio" NOT NULL DEFAULT 'MENSAGEM',
    "ruleId" TEXT,
    "mensagem" TEXT,
    "canal" "ChannelType",
    "filtroTodos" BOOLEAN NOT NULL DEFAULT false,
    "filtroEtiqueta" TEXT,
    "filtroValorMin" DECIMAL(12,2),
    "filtroValorMax" DECIMAL(12,2),
    "filtroFaixa" "RiskBand",
    "publicoDinamico" BOOLEAN NOT NULL DEFAULT true,
    "agendamento" "CampaignAgendamento" NOT NULL DEFAULT 'UMA_VEZ',
    "diaDoMes" INTEGER,
    "proximaExecucao" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'RASCUNHO',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_runs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "executadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalContatos" INTEGER NOT NULL DEFAULT 0,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'CONCLUIDA',

    CONSTRAINT "campaign_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "doc" TEXT,
    "status" "DispatchStatus" NOT NULL DEFAULT 'FILA',
    "canal" "ChannelType",
    "dispatchId" TEXT,
    "erro" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_tenantId_idx" ON "campaigns"("tenantId");

-- CreateIndex
CREATE INDEX "campaign_runs_campaignId_idx" ON "campaign_runs"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_recipients_runId_idx" ON "campaign_recipients"("runId");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "dunning_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_runId_fkey" FOREIGN KEY ("runId") REFERENCES "campaign_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
