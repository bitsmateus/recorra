import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { AsaasProvider } from '@/modules/payments/providers/asaas.provider';
import { ProviderCredentials } from '@/modules/payments/payment-provider.interface';

/**
 * Cobrança DA PLATAFORMA via Asaas: o SaaS fatura os próprios tenants.
 *
 * Distinto do fluxo por-tenant (cada tenant cobra os clientes dele). Aqui há uma
 * única conta Asaas — a sua — guardada cifrada em PlatformPaymentAccount. Cada
 * PlatformInvoice vira uma cobrança Asaas, com o tenant como cliente (vinculado
 * pelo CNPJ). O status "pago" NUNCA vem do corpo do webhook: é reconfirmado na
 * API do Asaas, que é a fonte autoritativa.
 */
@Injectable()
export class PlatformAsaasService {
  private readonly logger = new Logger(PlatformAsaasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Situação da configuração (sem devolver credenciais). */
  async getConfig() {
    const acc = await this.prisma.platformPaymentAccount.findFirst({ where: { ativo: true } });
    if (!acc) return { configurado: false as const };
    return { configurado: true as const, provider: acc.provider, ambiente: acc.ambiente };
  }

  /** Cria ou atualiza a única conta Asaas da plataforma (credenciais cifradas). */
  async saveConfig(body: { ambiente?: string; apiKey?: string; webhookToken?: string }) {
    const ambiente = body.ambiente === 'production' ? 'production' : 'sandbox';
    const existing = await this.prisma.platformPaymentAccount.findFirst();

    let apiKey = body.apiKey?.trim();
    let webhookToken = body.webhookToken?.trim() || undefined;
    // Campo em branco na edição = manter a chave atual (o painel diz isso).
    if (!apiKey) {
      if (!existing) throw new BadRequestException('Informe a API Key do Asaas.');
      const atual = this.crypto.decryptJson<ProviderCredentials>(existing.credentials);
      apiKey = atual.apiKey;
      if (webhookToken === undefined) webhookToken = atual.webhookToken;
    }

    const credentials = this.crypto.encryptJson({ apiKey, webhookToken });
    if (existing) {
      await this.prisma.platformPaymentAccount.update({ where: { id: existing.id }, data: { ambiente, credentials, ativo: true } });
    } else {
      await this.prisma.platformPaymentAccount.create({ data: { provider: 'ASAAS', ambiente, credentials } });
    }
    return { ok: true };
  }

  private async provider(): Promise<AsaasProvider> {
    const acc = await this.prisma.platformPaymentAccount.findFirst({ where: { ativo: true } });
    if (!acc) throw new BadRequestException('Configure o Asaas da plataforma primeiro.');
    const creds = this.crypto.decryptJson<ProviderCredentials>(acc.credentials);
    creds.ambiente = acc.ambiente as 'sandbox' | 'production';
    return new AsaasProvider(creds);
  }

  /** Gera a cobrança Asaas de uma fatura da plataforma (idempotente por fatura). */
  async cobrar(invoiceId: string) {
    const inv = await this.prisma.platformInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (inv.status === 'paga') throw new BadRequestException('Esta fatura já está paga.');
    if (inv.asaasPaymentId) {
      return { ok: true, jaExistia: true, linkPagamento: inv.linkPagamento, pixCopiaCola: inv.pixCopiaCola, status: inv.status };
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: inv.tenantId } });
    if (!tenant.cnpj) throw new BadRequestException('Cadastre o CNPJ do cliente antes de gerar a cobrança.');
    if (Number(inv.valorTotal) <= 0) throw new BadRequestException('Fatura sem valor a cobrar.');

    const provider = await this.provider();
    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + 7); // 7 dias para pagar
    const res = await provider.createCharge({
      customer: { nome: tenant.nome, doc: tenant.cnpj },
      valor: Number(inv.valorTotal),
      vencimento,
      metodo: 'PIX',
      descricao: `Recorrai — assinatura ${inv.competencia}`,
      externalRef: inv.id,
    });
    const paga = res.status === 'PAGA';
    const upd = await this.prisma.platformInvoice.update({
      where: { id: inv.id },
      data: {
        asaasPaymentId: res.externalId,
        linkPagamento: res.linkPagamento ?? null,
        pixCopiaCola: res.pixCopiaCola ?? null,
        boletoUrl: res.boletoUrl ?? null,
        status: paga ? 'paga' : 'cobrada',
        pagoEm: paga ? new Date() : null,
      },
    });
    return { ok: true, linkPagamento: upd.linkPagamento, pixCopiaCola: upd.pixCopiaCola, status: upd.status };
  }

  /** Reconsulta o status no Asaas e concilia (fonte autoritativa). */
  async sincronizar(invoiceId: string) {
    const inv = await this.prisma.platformInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (!inv.asaasPaymentId) throw new BadRequestException('Esta fatura ainda não foi cobrada no Asaas.');
    const provider = await this.provider();
    const st = await provider.getChargeStatus(inv.asaasPaymentId);
    const paga = st.status === 'PAGA';
    const upd = await this.prisma.platformInvoice.update({
      where: { id: inv.id },
      data: { status: paga ? 'paga' : inv.status === 'aberta' ? 'cobrada' : inv.status, pagoEm: paga ? st.pagoEm ?? new Date() : inv.pagoEm },
    });
    return { status: upd.status, pagoEm: upd.pagoEm };
  }

  /** Webhook do Asaas da plataforma. Nunca confia no corpo: reconfirma via API. */
  async handleWebhook(headers: Record<string, string>, body: unknown) {
    const provider = await this.provider().catch(() => null);
    if (!provider) return { ok: true };
    const parsed = provider.parseWebhook(headers, body);
    if (!parsed.externalId) return { ok: true };
    const inv = await this.prisma.platformInvoice.findFirst({ where: { asaasPaymentId: parsed.externalId } });
    if (!inv) return { ok: true };
    if (!parsed.valid) this.logger.warn(`Webhook da plataforma sem assinatura válida (${parsed.externalId}) — reconfirmando via API`);
    const st = await provider.getChargeStatus(parsed.externalId);
    if (st.status === 'PAGA' && inv.status !== 'paga') {
      await this.prisma.platformInvoice.update({ where: { id: inv.id }, data: { status: 'paga', pagoEm: st.pagoEm ?? new Date() } });
    }
    return { ok: true };
  }
}
