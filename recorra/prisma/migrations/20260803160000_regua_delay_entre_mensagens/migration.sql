-- Espacamento entre mensagens do lote diario da regua. O motor enfileirava o dia
-- inteiro com o mesmo `agendadoPara` e o processador mandava tudo em rajada (ate
-- 500/minuto), o que derruba a qualidade do numero no WhatsApp oficial.
-- 30s ja vale para as reguas existentes: e o lado seguro do erro.
ALTER TABLE "dunning_rules" ADD COLUMN "delaySegundos" INTEGER NOT NULL DEFAULT 30;
