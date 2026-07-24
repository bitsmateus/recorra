-- Botões do template WhatsApp, espelhados da Meta na sincronização.
-- Antes eram descartados: só o corpo era guardado.
ALTER TABLE "whatsapp_templates" ADD COLUMN IF NOT EXISTS "botoes" JSONB;
