-- Telas visíveis por usuário (sem personalização = padrão do papel)
ALTER TABLE "users" ADD COLUMN "telas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "users" ADD COLUMN "telasCustom" BOOLEAN NOT NULL DEFAULT false;
