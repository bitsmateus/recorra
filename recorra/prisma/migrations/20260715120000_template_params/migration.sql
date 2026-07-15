-- Envio como template aprovado (canal oficial): nome do template + parâmetros mapeados.
ALTER TABLE "dunning_steps" ADD COLUMN "templateName" TEXT;
ALTER TABLE "dunning_steps" ADD COLUMN "templateParams" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "message_dispatches" ADD COLUMN "templateName" TEXT;
ALTER TABLE "message_dispatches" ADD COLUMN "templateParams" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
