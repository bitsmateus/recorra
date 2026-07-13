-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR', 'LEITURA');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('TRIAL', 'NOTIFICADOR', 'ESSENCIAL', 'PROFISSIONAL', 'ESCALA', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "PaymentProviderType" AS ENUM ('ASAAS', 'MERCADO_PAGO', 'EFI', 'STRIPE');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP_CLOUD', 'WHATSAPP_EVOLUTION', 'WHATSAPP_UAZAPI', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "SourceSystem" AS ENUM ('IXC', 'SGP', 'HUBSOFT', 'VOALLE', 'MKAUTH', 'CSV', 'API');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDENTE', 'VENCIDA', 'PAGA', 'CANCELADA', 'ESTORNADA');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ATIVA', 'INADIMPLENTE', 'PAUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('ATIVO', 'QUITADO', 'QUEBRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ChargeMethod" AS ENUM ('PIX', 'BOLETO', 'CARTAO', 'PIX_AUTOMATICO');

-- CreateEnum
CREATE TYPE "RiskBand" AS ENUM ('BOM', 'ATENCAO', 'RISCO');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('FILA', 'ENVIADO', 'ENTREGUE', 'LIDO', 'FALHA', 'IGNORADO');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('CONCEDIDO', 'REVOGADO');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('UTILITY', 'MARKETING', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('RASCUNHO', 'PENDENTE', 'APROVADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ABERTA', 'PENDENTE', 'RESOLVIDA');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('CLIENTES', 'FATURAS');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "plano" "PlanTier" NOT NULL DEFAULT 'TRIAL',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "config" JSONB,
    "featureFlags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoUso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OPERADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "emailVerify" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "verifyTokenExp" TIMESTAMP(3),
    "twoFaSecret" TEXT,
    "twoFaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inviteToken" TEXT,
    "inviteTokenExp" TIMESTAMP(3),
    "convidado" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "doc" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "contrato" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "plano" TEXT,
    "valorPlano" DECIMAL(12,2),
    "cidade" TEXT,
    "uf" TEXT,
    "sourceSystem" "SourceSystem",
    "externalId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_provider_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "PaymentProviderType" NOT NULL,
    "apelido" TEXT,
    "ambiente" TEXT NOT NULL DEFAULT 'sandbox',
    "credentials" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_provider_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "canal" "ChannelType" NOT NULL,
    "apelido" TEXT,
    "credentials" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sistema" "SourceSystem" NOT NULL,
    "urlBase" TEXT,
    "credentials" TEXT,
    "ultimaSync" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "tipo" "SyncType" NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "detalhe" TEXT,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadoEm" TIMESTAMP(3),

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerAccountId" TEXT,
    "provider" "PaymentProviderType",
    "externalId" TEXT,
    "sourceSystem" "SourceSystem",
    "sourceExternalId" TEXT,
    "descricao" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDENTE',
    "metodo" "ChargeMethod" NOT NULL DEFAULT 'PIX',
    "pixCopiaCola" TEXT,
    "boletoLinha" TEXT,
    "boletoUrl" TEXT,
    "linkPagamento" TEXT,
    "splitConfig" JSONB,
    "origem" TEXT,
    "contestada" BOOLEAN NOT NULL DEFAULT false,
    "pagoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "plano" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "ciclo" TEXT NOT NULL DEFAULT 'MENSAL',
    "metodo" "ChargeMethod" NOT NULL DEFAULT 'PIX_AUTOMATICO',
    "diaVenc" INTEGER NOT NULL DEFAULT 10,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ATIVA',
    "proximaCobranca" TIMESTAMP(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimaTentativa" TIMESTAMP(3),
    "pixAutoAuthId" TEXT,
    "pixAutoStatus" TEXT,
    "splitConfig" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "valorOriginal" DECIMAL(12,2) NOT NULL,
    "descontoPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "valorAcordado" DECIMAL(12,2) NOT NULL,
    "parcelas" INTEGER NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'ATIVO',
    "faturasOrigem" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_installments" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDENTE',

    CONSTRAINT "agreement_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunning_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nicho" TEXT,
    "faixaRisco" "RiskBand",
    "apenasNotificar" BOOLEAN NOT NULL DEFAULT false,
    "janelaInicio" INTEGER NOT NULL DEFAULT 9,
    "janelaFim" INTEGER NOT NULL DEFAULT 20,
    "diasUteisSomente" BOOLEAN NOT NULL DEFAULT false,
    "maxMsgsDia" INTEGER,
    "roteamentoPorCusto" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dunning_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunning_steps" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "offsetDias" INTEGER NOT NULL,
    "canal" "ChannelType" NOT NULL,
    "canaisFallback" "ChannelType"[] DEFAULT ARRAY[]::"ChannelType"[],
    "template" TEXT NOT NULL,
    "templateB" TEXT,
    "abTest" BOOLEAN NOT NULL DEFAULT false,
    "condicoes" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dunning_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_dispatches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "channelAccountId" TEXT,
    "canal" "ChannelType" NOT NULL,
    "cadeiaCanais" "ChannelType"[] DEFAULT ARRAY[]::"ChannelType"[],
    "template" TEXT,
    "conteudo" TEXT,
    "variante" TEXT,
    "tentativaFallback" INTEGER NOT NULL DEFAULT 0,
    "status" "DispatchStatus" NOT NULL DEFAULT 'FILA',
    "custo" DECIMAL(10,4),
    "providerMsgId" TEXT,
    "erro" TEXT,
    "agendadoPara" TIMESTAMP(3),
    "enviadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" "PaymentProviderType" NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "assinaturaOk" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "processadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "antes" JSONB,
    "depois" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "canal" "ChannelType" NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'CONCEDIDO',
    "origem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_scores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "faixa" "RiskBand" NOT NULL,
    "fatores" JSONB NOT NULL,
    "modeloVersao" TEXT NOT NULL DEFAULT 'regras-v1',
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'pt_BR',
    "categoria" "TemplateCategory" NOT NULL DEFAULT 'UTILITY',
    "corpo" TEXT NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'RASCUNHO',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "canal" "ChannelType" NOT NULL,
    "contato" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ABERTA',
    "atribuidoA" TEXT,
    "ultimaMensagem" TEXT,
    "ultimaMensagemEm" TIMESTAMP(3),
    "naoLidas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direcao" "MessageDirection" NOT NULL,
    "texto" TEXT NOT NULL,
    "autor" TEXT,
    "intent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "plano" "PlanTier" NOT NULL,
    "valorBase" DECIMAL(12,2) NOT NULL,
    "disparos" INTEGER NOT NULL DEFAULT 0,
    "valorExcedente" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_history_features" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "atrasosQtd" INTEGER NOT NULL DEFAULT 0,
    "atrasoMedioDias" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "faturasPagas" INTEGER NOT NULL DEFAULT 0,
    "faturasVencidas" INTEGER NOT NULL DEFAULT 0,
    "ultimoAtrasoEm" TIMESTAMP(3),
    "taxaResposta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_history_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "customers_tenantId_idx" ON "customers"("tenantId");

-- CreateIndex
CREATE INDEX "customers_tenantId_externalId_idx" ON "customers"("tenantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_doc_key" ON "customers"("tenantId", "doc");

-- CreateIndex
CREATE INDEX "payment_provider_accounts_tenantId_idx" ON "payment_provider_accounts"("tenantId");

-- CreateIndex
CREATE INDEX "channel_accounts_tenantId_idx" ON "channel_accounts"("tenantId");

-- CreateIndex
CREATE INDEX "source_integrations_tenantId_idx" ON "source_integrations"("tenantId");

-- CreateIndex
CREATE INDEX "sync_logs_tenantId_idx" ON "sync_logs"("tenantId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_status_idx" ON "invoices"("tenantId", "status");

-- CreateIndex
CREATE INDEX "invoices_tenantId_vencimento_idx" ON "invoices"("tenantId", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_provider_externalId_key" ON "invoices"("tenantId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_idx" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_proximaCobranca_idx" ON "subscriptions"("tenantId", "proximaCobranca");

-- CreateIndex
CREATE INDEX "agreements_tenantId_idx" ON "agreements"("tenantId");

-- CreateIndex
CREATE INDEX "agreement_installments_agreementId_idx" ON "agreement_installments"("agreementId");

-- CreateIndex
CREATE INDEX "dunning_rules_tenantId_idx" ON "dunning_rules"("tenantId");

-- CreateIndex
CREATE INDEX "dunning_steps_ruleId_idx" ON "dunning_steps"("ruleId");

-- CreateIndex
CREATE INDEX "message_dispatches_tenantId_status_idx" ON "message_dispatches"("tenantId", "status");

-- CreateIndex
CREATE INDEX "message_dispatches_tenantId_createdAt_idx" ON "message_dispatches"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_idempotencyKey_key" ON "webhook_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "webhook_events_tenantId_idx" ON "webhook_events"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "consents_customerId_idx" ON "consents"("customerId");

-- CreateIndex
CREATE INDEX "risk_scores_tenantId_customerId_idx" ON "risk_scores"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "whatsapp_templates_tenantId_idx" ON "whatsapp_templates"("tenantId");

-- CreateIndex
CREATE INDEX "conversations_tenantId_status_idx" ON "conversations"("tenantId", "status");

-- CreateIndex
CREATE INDEX "inbox_messages_conversationId_idx" ON "inbox_messages"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE INDEX "platform_invoices_tenantId_idx" ON "platform_invoices"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_tenantId_competencia_key" ON "platform_invoices"("tenantId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "payment_history_features_customerId_key" ON "payment_history_features"("customerId");

-- CreateIndex
CREATE INDEX "payment_history_features_tenantId_idx" ON "payment_history_features"("tenantId");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_provider_accounts" ADD CONSTRAINT "payment_provider_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_integrations" ADD CONSTRAINT "source_integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "source_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "payment_provider_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_installments" ADD CONSTRAINT "agreement_installments_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunning_rules" ADD CONSTRAINT "dunning_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunning_steps" ADD CONSTRAINT "dunning_steps_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "dunning_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_history_features" ADD CONSTRAINT "payment_history_features_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
