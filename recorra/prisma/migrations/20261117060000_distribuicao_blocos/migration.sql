-- Distribuição em blocos (cima/baixo) e controle da última divisão completa
ALTER TYPE "DistribuicaoModo" ADD VALUE 'BLOCOS';

ALTER TABLE "carteiras" ADD COLUMN "distribuicaoEm" TIMESTAMP(3);
