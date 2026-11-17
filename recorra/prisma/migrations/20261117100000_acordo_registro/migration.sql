-- AlterTable
ALTER TABLE "agreements" ADD COLUMN     "criadoPorId" TEXT,
ADD COLUMN     "dataAcordo" TIMESTAMP(3),
ADD COLUMN     "dataPrevista" TIMESTAMP(3),
ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "origem" TEXT NOT NULL DEFAULT 'renegociacao',
ADD COLUMN     "tipo" TEXT;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
