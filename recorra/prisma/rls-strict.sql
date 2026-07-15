-- ============================================================
-- RLS ESTRITA — 2ª barreira REAL de isolamento por tenant.
-- Substitui a policy permissiva de prisma/rls.sql.
--
-- PRÉ-REQUISITOS antes de aplicar (ver R-03 no SECURITY_AUDIT.md):
--   1) App API rodando com RLS_ENFORCED=true (o TenantContextInterceptor passa
--      a abrir uma transação por requisição e definir app.current_tenant).
--   2) Caminhos SEM contexto de requisição precisam de tratamento:
--        - Worker (cron/fila): rode com um ROLE de banco separado com BYPASSRLS,
--          OU envolva o processamento por-tenant em prisma.withTenant(tenantId, ...).
--        - Webhooks de pagamento/inbound (rotas públicas, sem JWT): envolva as
--          escritas em prisma.withTenant(account.tenantId, ...) — senão a RLS
--          estrita bloqueia a baixa de fatura.
--        - Auth (login/register/refresh/reset): operam sem tenant e precisam de
--          acesso global — use um ROLE com BYPASSRLS para o processo API OU
--          mantenha essas tabelas (users durante login) fora do modo FORCE.
--   3) O ROLE da aplicação NÃO pode ser superuser (superuser ignora RLS).
--
-- Recomendado: 2 roles — `recorra_api` (RLS on) e `recorra_worker`/webhooks
-- (BYPASSRLS). Ative em staging e rode `npm run test:e2e` antes de produção.
-- ============================================================

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'api_keys', 'users', 'customers', 'payment_provider_accounts',
    'channel_accounts', 'source_integrations', 'sync_logs', 'invoices',
    'subscriptions', 'agreements', 'dunning_rules', 'message_dispatches',
    'audit_logs', 'risk_scores', 'payment_history_features',
    'whatsapp_templates', 'conversations', 'inbox_messages', 'tags',
    'campaigns', 'campaign_runs', 'campaign_recipients'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    -- Estrita: SEM o escape de "não definido". Sem app.current_tenant, nega tudo.
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING ("tenantId" = current_setting('app.current_tenant', true))
        WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
    $f$, t);
  END LOOP;
END $$;
