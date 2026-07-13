-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "excluirIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "incluirIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "dunning_steps" ADD COLUMN     "channelAccountId" TEXT;
