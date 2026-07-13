import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { ConnectorFactory } from '@/modules/connectors/connector.factory';
import { CreateIntegrationDto, CreatePaymentAccountDto, CreateChannelAccountDto } from './dto/settings.dto';

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

  /** Testa a conexão com o ERP configurado. */
  async testIntegration(tenantId: string, id: string) {
    const integ = await this.prisma.sourceIntegration.findFirstOrThrow({ where: { id, tenantId } });
    try {
      const connector = await this.connectors.forIntegration(integ.id);
      const ok = await connector.testConnection();
      await this.prisma.sourceIntegration.update({ where: { id }, data: { status: ok ? 'ok' : 'falha' } });
      return { ok };
    } catch (e) {
      return { ok: false, erro: String(e) };
    }
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
