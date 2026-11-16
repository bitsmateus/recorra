-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "promessaAte" TIMESTAMP(3),
ADD COLUMN     "riscoManual" "RiskBand",
ADD COLUMN     "riscoManualEm" TIMESTAMP(3),
ADD COLUMN     "riscoManualMotivo" TEXT,
ADD COLUMN     "riscoManualPorId" TEXT;

-- AlterTable
ALTER TABLE "risk_scores" ADD COLUMN     "historico" JSONB;
