-- Campanha arquivada: campanhas já enviadas não podem ser excluídas, só arquivadas
-- (saem da lista principal e vão para a aba "Arquivados").
ALTER TABLE "campaigns" ADD COLUMN "arquivada" BOOLEAN NOT NULL DEFAULT false;
