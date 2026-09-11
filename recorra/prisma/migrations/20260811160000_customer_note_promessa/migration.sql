-- Promessa de pagamento passa a viver na mesma tabela de notas (tipo PROMESSA),
-- pra aparecer junto na linha do tempo do cliente. Campos de ERP ficam prontos
-- pro dia em que algum conector implementar o envio de verdade (hoje nenhum faz).
CREATE TYPE "NotaTipo" AS ENUM ('NOTA', 'PROMESSA');

ALTER TABLE "customer_notes" ADD COLUMN "tipo" "NotaTipo" NOT NULL DEFAULT 'NOTA';
ALTER TABLE "customer_notes" ADD COLUMN "dataPromessa" TIMESTAMP(3);
ALTER TABLE "customer_notes" ADD COLUMN "valorPrometido" DECIMAL(12,2);
ALTER TABLE "customer_notes" ADD COLUMN "erpSincronizado" BOOLEAN;
ALTER TABLE "customer_notes" ADD COLUMN "erpErro" TEXT;
