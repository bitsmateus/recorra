-- Situação cadastral do contrato no ERP de origem (ativo/cancelado/suspenso etc.),
-- separada do `ativo` genérico. NULL para clientes sem esse dado (cadastro manual
-- ou conector que ainda não traz essa informação).
ALTER TABLE "customers" ADD COLUMN "statusContrato" TEXT;
