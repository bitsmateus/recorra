-- Botões dinâmicos de template (URL dinâmica / copiar código, ex.: link e Pix).
-- No passo da régua e na campanha guardamos o mapeamento (qual variável Recorra
-- preenche cada botão); no disparo, o valor já resolvido para o cliente.
ALTER TABLE "dunning_steps" ADD COLUMN "templateBotoes" JSONB;
ALTER TABLE "campaigns" ADD COLUMN "templateBotoes" JSONB;
ALTER TABLE "message_dispatches" ADD COLUMN "templateBotoes" JSONB;
