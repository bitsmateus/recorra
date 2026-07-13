import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PaymentProviderFactory } from './payment-provider.factory';

/**
 * Conciliação automática: consulta o status das cobranças em aberto nos
 * gateways e, quando pagas, dá baixa + pausa a régua + enfileira confirmação.
 * Complementa o webhook (para casos em que o webhook falha/atrasa).
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: PaymentProviderFactory,
  ) {}

  /** Reconciliação de todas as faturas em aberto com cobrança gerada. */
  async reconcileTenant(tenantId: string) {
    const abertas = await this.prisma.invoice.findMany({
      where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, externalId: { not: null }, providerAccountId: { not: null } },
      take: 300,
    });

    let baixadas = 0;
    for (const inv of abertas) {
      try {
        const provider = await this.factory.forAccount(inv.providerAccountId!);
        const st = await provider.getChargeStatus(inv.externalId!);
        if (st.status === 'PAGA') {
          await this.baixar(tenantId, inv.id, inv.customerId, undefined, st.pagoEm);
          baixadas++;
        } else if (st.status === 'VENCIDA' && inv.status !== 'VENCIDA') {
          await this.prisma.invoice.update({ where: { id: inv.id }, data: { status: 'VENCIDA' } });
        }
      } catch (e) {
        this.logger.warn(`Falha ao conciliar fatura ${inv.id}: ${String(e)}`);
      }
    }
    return { verificadas: abertas.length, baixadas };
  }

  /** Baixa + pausa régua + confirmação (mesma lógica do webhook). */
  private async baixar(tenantId: string, invoiceId: string, customerId: string, nome?: string, pagoEm?: Date) {
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'PAGA', pagoEm: pagoEm ?? new Date() } });
    await this.prisma.messageDispatch.updateMany({
      where: { tenantId, invoiceId, status: 'FILA' },
      data: { status: 'IGNORADO', erro: 'Pagamento confirmado (conciliação)' },
    });
    const customer = nome ? { nome } : await this.prisma.customer.findUnique({ where: { id: customerId }, select: { nome: true } });
    const primeiro = customer?.nome?.split(' ')[0] ?? 'cliente';
    await this.prisma.messageDispatch.create({
      data: {
        tenantId,
        customerId,
        invoiceId,
        canal: 'WHATSAPP_CLOUD',
        template: 'confirmacao_pagamento',
        conteudo: `Recebemos seu pagamento, ${primeiro}! Obrigado 🙌 Sua fatura está quitada.`,
        status: 'FILA',
        agendadoPara: new Date(),
      },
    });
  }
}
