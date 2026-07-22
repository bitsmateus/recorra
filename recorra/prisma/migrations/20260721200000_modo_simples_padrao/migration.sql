-- Novos clientes começam no MODO SIMPLES (faixa de risco só para quem ativar).
-- Não altera os tenants existentes — só muda o padrão de quem for criado agora.
ALTER TABLE "tenants" ALTER COLUMN "usarFaixaRisco" SET DEFAULT false;
