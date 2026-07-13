-- ============================================================
-- Row-Level Security (RLS) — SEGUNDA barreira de isolamento por tenant.
-- A PRIMEIRA barreira é sempre o `where tenantId` na aplicação.
-- Rode após `prisma migrate deploy`:  psql "$DATABASE_URL" -f prisma/rls.sql
--
-- Política adotada (pragmática e segura para a Fase 1):
--   - Se `app.current_tenant` NÃO estiver definido → permite (a aplicação já
--     filtra por tenantId; login/refresh/registro precisam de acesso global).
--   - Se estiver definido (via PrismaService.withTenant) → FORÇA o isolamento.
--
-- Endurecimento futuro: envelopar todas as leituras/escritas de tenant em
-- withTenant() e então trocar a policy para o modo estrito (remover o OR de
-- "não definido") + FORCE ROW LEVEL SECURITY.
--
-- IMPORTANTE: o usuário do banco da aplicação NÃO deve ser superuser.
-- ============================================================

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'customers', 'payment_provider_accounts', 'channel_accounts',
    'source_integrations', 'sync_logs', 'invoices', 'subscriptions',
    'dunning_rules', 'message_dispatches', 'audit_logs', 'risk_scores',
    'payment_history_features'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (
          current_setting('app.current_tenant', true) IS NULL
          OR current_setting('app.current_tenant', true) = ''
          OR "tenantId" = current_setting('app.current_tenant', true)
        )
        WITH CHECK (
          current_setting('app.current_tenant', true) IS NULL
          OR current_setting('app.current_tenant', true) = ''
          OR "tenantId" = current_setting('app.current_tenant', true)
        );
    $f$, t);
  END LOOP;
END $$;
