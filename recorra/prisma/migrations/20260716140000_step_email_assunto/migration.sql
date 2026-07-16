-- Assunto do e-mail por passo da régua (sem ele, o envio caía no genérico "Aviso de cobrança").
ALTER TABLE "dunning_steps" ADD COLUMN "emailAssunto" TEXT;
