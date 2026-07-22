import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { lerPagamentoRecebido } from './pagamento-recebido';

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const CANAIS_WHATSAPP: ChannelType[] = ['WHATSAPP_CLOUD', 'WHATSAPP_EVOLUTION', 'WHATSAPP_UAZAPI', 'NX_SYSTEMS'];

/**
 * Confirmação de "pagamento recebido" enviada ao cliente quando a fatura é baixada.
 *
 * Antes o texto e o canal estavam fixos no código (e divergiam entre o webhook e a
 * conciliação). Agora vêm da preferência do tenant (Tenant.config.pagamentoRecebido),
 * editável no painel, e o canal usado é uma conta de canal ATIVA do tenant.
 */
@Injectable()
export class PaymentNotifyService {
  private readonly logger = new Logger(PaymentNotifyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Enfileira a confirmação. Silencioso quando desligado ou sem canal utilizável. */
  async confirmarPagamento(tenantId: string, invoiceId: string, customerId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const pref = lerPagamentoRecebido(tenant?.config);
    if (!pref.ativo) return;

    // Canal escolhido (se tiver conta ativa) ou a primeira conta ativa do tenant.
    const conta = pref.canal
      ? await this.prisma.channelAccount.findFirst({ where: { tenantId, canal: pref.canal as ChannelType, ativo: true } })
      : await this.prisma.channelAccount.findFirst({ where: { tenantId, ativo: true } });
    if (!conta) return;

    // WhatsApp exige template HSM aprovado; sem ele o disparo falharia sempre.
    const ehWhatsapp = CANAIS_WHATSAPP.includes(conta.canal);
    if (ehWhatsapp && !pref.templateName.trim()) {
      this.logger.warn(`Confirmacao de pagamento nao enviada (tenant ${tenantId}): canal ${conta.canal} exige templateName.`);
      return;
    }

    const [invoice, customer] = await Promise.all([
      this.prisma.invoice.findUnique({ where: { id: invoiceId }, select: { valor: true, vencimento: true } }),
      this.prisma.customer.findUnique({ where: { id: customerId }, select: { nome: true } }),
    ]);

    const primeiroNome = customer?.nome?.trim().split(' ')[0] || 'cliente';
    const resolver = (txt: string) =>
      txt
        .replace(/\{\{\s*nome\s*\}\}/g, primeiroNome)
        .replace(/\{\{\s*valor\s*\}\}/g, invoice ? brl(Number(invoice.valor)) : '')
        .replace(/\{\{\s*vencimento\s*\}\}/g, invoice ? invoice.vencimento.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '');

    const conteudo = resolver(pref.conteudo);
    // Cada {{n}} do template HSM recebe o token configurado, já resolvido.
    const templateParams = (pref.templateParams ?? []).map(resolver);

    await this.prisma.messageDispatch.create({
      data: {
        tenantId,
        customerId,
        invoiceId,
        canal: conta.canal,
        channelAccountId: conta.id,
        template: 'confirmacao_pagamento',
        ...(pref.templateName.trim() ? { templateName: pref.templateName.trim(), templateParams } : {}),
        ...(conta.canal === 'EMAIL' && pref.assunto.trim() ? { assunto: pref.assunto.trim() } : {}),
        conteudo,
        status: 'FILA',
        agendadoPara: new Date(),
      },
    });
  }
}
