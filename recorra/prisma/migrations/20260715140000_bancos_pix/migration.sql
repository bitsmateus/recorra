-- Bancos com API Pix (padrão BACEN) como provedores de pagamento.
ALTER TYPE "PaymentProviderType" ADD VALUE IF NOT EXISTS 'BANCO_INTER';
ALTER TYPE "PaymentProviderType" ADD VALUE IF NOT EXISTS 'SICOOB';
ALTER TYPE "PaymentProviderType" ADD VALUE IF NOT EXISTS 'SICREDI';
ALTER TYPE "PaymentProviderType" ADD VALUE IF NOT EXISTS 'BANCO_BRASIL';
