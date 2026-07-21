-- Filtro de público por situação da cobrança (VENCIDA | PENDENTE | ABERTO | EM_DIA).
ALTER TABLE "campaigns" ADD COLUMN "filtroStatus" TEXT;
