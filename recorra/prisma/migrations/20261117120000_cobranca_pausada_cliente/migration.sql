ALTER TABLE "customers" ADD COLUMN "cobrancaPausada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cobrancaPausadaMotivo" TEXT,
ADD COLUMN "cobrancaPausadaPorId" TEXT,
ADD COLUMN "cobrancaPausadaEm" TIMESTAMP(3);
