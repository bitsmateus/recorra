-- Intervalo padrão entre mensagens passa de 5s para 20s: disparar em rajada é o
-- que mais derruba número no WhatsApp. Só muda o padrão de campanhas NOVAS —
-- as existentes mantêm o intervalo que o cliente já escolheu.
ALTER TABLE "campaigns" ALTER COLUMN "delaySegundos" SET DEFAULT 20;
