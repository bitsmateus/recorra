-- AlterEnum
ALTER TYPE "CampaignTipoEnvio" ADD VALUE 'LEMBRETE';

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "escopoFatura" TEXT NOT NULL DEFAULT 'TODAS';
