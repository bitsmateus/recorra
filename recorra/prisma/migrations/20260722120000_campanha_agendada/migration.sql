-- Novo status para campanhas de envio único com início agendado.
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'AGENDADA';

-- Data/hora escolhida para o disparo começar sozinho (só vale para UMA_VEZ).
ALTER TABLE "campaigns" ADD COLUMN "agendadaPara" TIMESTAMP(3);
