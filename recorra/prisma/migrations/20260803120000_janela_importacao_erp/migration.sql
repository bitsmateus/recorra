-- Janela de importação do ERP: só faturas vencidas nos últimos N dias viram
-- cobrança nova. NULL preserva o comportamento anterior (sem limite) para as
-- integrações que já existem — mudar isso na migration silenciaria cobrança
-- legítima de quem hoje depende do histórico completo.
ALTER TABLE "source_integrations" ADD COLUMN "diasHistorico" INTEGER;
