-- O schema.prisma declara 2FA no PlatformAdmin desde sempre, mas nenhuma migração
-- criou as colunas: a init criou "twoFa*" em "users" e não em "platform_admins".
-- Sem elas, qualquer leitura de platformAdmin quebra ("column does not exist") —
-- o seed não roda e o login do superadmin responde 500.
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "twoFaSecret" TEXT;
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "twoFaEnabled" BOOLEAN NOT NULL DEFAULT false;
