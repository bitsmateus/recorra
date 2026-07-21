-- Faixa de risco atual desnormalizada no cliente (permite filtrar/paginar por risco no banco).
ALTER TABLE "customers" ADD COLUMN "faixaAtual" "RiskBand";

-- Backfill: pega a faixa do RiskScore mais recente de cada cliente.
UPDATE "customers" c
SET "faixaAtual" = rs.faixa
FROM (
  SELECT DISTINCT ON ("customerId") "customerId", faixa
  FROM "risk_scores"
  ORDER BY "customerId", "calculadoEm" DESC
) rs
WHERE rs."customerId" = c.id;

CREATE INDEX "customers_tenantId_faixaAtual_idx" ON "customers"("tenantId", "faixaAtual");
