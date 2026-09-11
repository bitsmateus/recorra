-- Carteira do operador na esteira: OPERADOR/LEITURA veem só a faixa de dias da
-- própria equipe (config em Tenant.config.carteira); OWNER/ADMIN/FINANCEIRO
-- continuam vendo tudo, independente deste campo. NULL = sem restrição.
CREATE TYPE "EquipeCobranca" AS ENUM ('EQUIPE_1', 'EQUIPE_2');

ALTER TABLE "users" ADD COLUMN "equipeCobranca" "EquipeCobranca";
