-- Operador responsável por um cliente: atribuição manual, independente da
-- carteira (que é automática pela faixa de dias de atraso). Usado como filtro
-- "por pessoa" na esteira — não restringe quem pode ver o cliente.
ALTER TABLE "customers" ADD COLUMN "responsavelId" TEXT;
CREATE INDEX "customers_responsavelId_idx" ON "customers"("responsavelId");
ALTER TABLE "customers" ADD CONSTRAINT "customers_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
