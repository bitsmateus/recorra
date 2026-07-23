import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { lerPagamentoRecebido } from '@/modules/payments/pagamento-recebido';
import { CryptoService } from '@/common/crypto/crypto.service';
import { ConnectorFactory } from '@/modules/connectors/connector.factory';
import { PaymentProviderFactory } from '@/modules/payments/payment-provider.factory';
import { CreateIntegrationDto, UpdateIntegrationDto, CreatePaymentAccountDto, UpdatePaymentAccountDto, CreateChannelAccountDto, PagamentoRecebidoDto } from './dto/settings.dto';

/**
 * Configuração do tenant: integrações de origem (ERP), contas de gateway e
 * canais de mensagem. Todas as credenciais são cifradas antes de persistir.
 * Nas respostas de listagem, as credenciais NUNCA são retornadas.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly connectors: ConnectorFactory,
    private readonly payments: PaymentProviderFactory,
  ) {}

  // ---------- Integrações (ERP) ----------

  async listIntegrations(tenantId: string) {
    const rows = await this.prisma.sourceIntegration.findMany({ where: { tenantId } });
    return rows.map(({ credentials, ...rest }) => rest);
  }

  async createIntegration(tenantId: string, dto: CreateIntegrationDto) {
    const created = await this.prisma.sourceIntegration.create({
      data: {
        tenantId,
        sistema: dto.sistema,
        urlBase: dto.urlBase,
        credentials: this.crypto.encryptJson({ ...dto.credentials, urlBase: dto.urlBase }),
        status: 'configurada',
      },
    });
    const { credentials, ...rest } = created;
    void credentials;
    return rest;
  }

  /**
   * Edita uma integração. `urlBase` é opcional; `credentials` só é recifrado se
   * vier com chaves — assim o usuário pode alterar só a URL sem redigitar o token.
   * Como as credenciais nunca são retornadas, editar sem enviar credentials preserva
   * as atuais. Qualquer mudança volta o status para "configurada" (precisa retestar).
   */
  async updateIntegration(tenantId: string, id: string, dto: UpdateIntegrationDto) {
    const existing = await this.prisma.sourceIntegration.findFirstOrThrow({ where: { id, tenantId } });
    const data: { urlBase?: string; credentials?: string; status?: string } = {};

    if (dto.urlBase !== undefined) data.urlBase = dto.urlBase;
    const urlBase = dto.urlBase ?? existing.urlBase ?? undefined;

    const hasNewCreds = dto.credentials && Object.keys(dto.credentials).length > 0;
    if (hasNewCreds) {
      data.credentials = this.crypto.encryptJson({ ...dto.credentials, urlBase });
      data.status = 'configurada';
    } else if (dto.urlBase !== undefined && existing.credentials) {
      // Só mudou a URL: reescreve a urlBase dentro das credenciais existentes.
      const current = this.crypto.decryptJson(existing.credentials);
      data.credentials = this.crypto.encryptJson({ ...current, urlBase });
      data.status = 'configurada';
    }

    const updated = await this.prisma.sourceIntegration.update({ where: { id }, data });
    const { credentials, ...rest } = updated;
    void credentials;
    return rest;
  }

  async removeIntegration(tenantId: string, id: string) {
    await this.prisma.sourceIntegration.deleteMany({ where: { id, tenantId } });
    return { ok: true };
  }

  /** Testa a conexão com o ERP configurado. */
  async testIntegration(tenantId: string, id: string) {
    const integ = await this.prisma.sourceIntegration.findFirstOrThrow({ where: { id, tenantId } });
    try {
      const connector = await this.connectors.forIntegration(integ.id, tenantId);
      const ok = await connector.testConnection();
      await this.prisma.sourceIntegration.update({ where: { id }, data: { status: ok ? 'ok' : 'falha' } });
      return { ok };
    } catch (e) {
      // O conector pode lançar com o motivo (token, rede, endpoint). Marca falha
      // e devolve a mensagem limpa — sem o prefixo "Error:" na cara do usuário.
      await this.prisma.sourceIntegration.update({ where: { id }, data: { status: 'falha' } }).catch(() => undefined);
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  }

  // ---------- Mensagem de pagamento recebido ----------

  /** Preferência da confirmação de pagamento (Tenant.config.pagamentoRecebido). */
  async getPagamentoRecebido(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    return lerPagamentoRecebido(t?.config);
  }

  /** Grava a preferência preservando o resto do Tenant.config. */
  async savePagamentoRecebido(tenantId: string, dto: PagamentoRecebidoDto) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const atual = (t?.config ?? {}) as Prisma.JsonObject;
    const pagamentoRecebido = { ...lerPagamentoRecebido(atual), ...dto } as unknown as Prisma.JsonObject;
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { config: { ...atual, pagamentoRecebido } as Prisma.InputJsonValue },
    });
    return this.getPagamentoRecebido(tenantId);
  }

  // ---------- Gateways ----------

  async listPaymentAccounts(tenantId: string) {
    const rows = await this.prisma.paymentProviderAccount.findMany({ where: { tenantId } });
    return rows.map(({ credentials, ...rest }) => rest);
  }

  async createPaymentAccount(tenantId: string, dto: CreatePaymentAccountDto) {
    const created = await this.prisma.paymentProviderAccount.create({
      data: {
        tenantId,
        provider: dto.provider,
        apelido: dto.apelido,
        ambiente: dto.ambiente,
        credentials: this.crypto.encryptJson(dto.credentials),
      },
    });
    const { credentials, ...rest } = created;
    void credentials;
    return rest;
  }

  /**
   * Edita um gateway. `credentials` só é recifrado se vier com chaves — permite
   * trocar só o ambiente/apelido sem redigitar a chave. Como as credenciais nunca
   * são retornadas, editar sem enviá-las preserva as atuais.
   */
  async updatePaymentAccount(tenantId: string, id: string, dto: UpdatePaymentAccountDto) {
    await this.prisma.paymentProviderAccount.findFirstOrThrow({ where: { id, tenantId } });
    const data: { apelido?: string; ambiente?: string; credentials?: string } = {};
    if (dto.apelido !== undefined) data.apelido = dto.apelido;
    if (dto.ambiente !== undefined) data.ambiente = dto.ambiente;
    if (dto.credentials && Object.keys(dto.credentials).length > 0) {
      data.credentials = this.crypto.encryptJson(dto.credentials);
    }
    const updated = await this.prisma.paymentProviderAccount.update({ where: { id }, data });
    const { credentials, ...rest } = updated;
    void credentials;
    return rest;
  }

  async removePaymentAccount(tenantId: string, id: string) {
    await this.prisma.paymentProviderAccount.deleteMany({ where: { id, tenantId } });
    return { ok: true };
  }

  /** Testa a conexão com o gateway configurado (chamada leve autenticada). */
  async testPaymentAccount(tenantId: string, id: string) {
    try {
      const provider = await this.payments.forAccount(id, tenantId);
      if (!provider.testConnection) return { ok: false, erro: 'Teste não disponível para este gateway' };
      const ok = await provider.testConnection();
      return { ok };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  }

  // ---------- Canais ----------

  async listChannelAccounts(tenantId: string) {
    const rows = await this.prisma.channelAccount.findMany({ where: { tenantId } });
    return rows.map(({ credentials, ...rest }) => rest);
  }

  async createChannelAccount(tenantId: string, dto: CreateChannelAccountDto) {
    const created = await this.prisma.channelAccount.create({
      data: {
        tenantId,
        canal: dto.canal,
        apelido: dto.apelido,
        ativo: dto.ativo ?? true,
        credentials: this.crypto.encryptJson(dto.credentials),
      },
    });
    const { credentials, ...rest } = created;
    void credentials;
    return rest;
  }

  // ---------- Réguas ----------

  async listRules(tenantId: string) {
    return this.prisma.dunningRule.findMany({
      where: { tenantId },
      include: { steps: { orderBy: { ordem: 'asc' } } },
    });
  }
}
