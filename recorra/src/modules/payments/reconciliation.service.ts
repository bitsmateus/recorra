import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PaymentProviderFactory } from './payment-provider.factory';
import { PaymentNotifyService } from './payment-notify.service';

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
    private readonly notify: PaymentNotifyService,
  ) {}

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Consulta o status com tolerância a rate limit (HTTP 429): o gateway (ex.: Asaas)
   * limita requisições por segundo. Em 429, espera (respeita Retry-After se vier) e
   * repete algumas vezes antes de desistir.
   */
  private async statusComRetry(provider: { getChargeStatus: (id: string) => Promise<{ status: string; pagoEm?: Date }> }, externalId: string, tentativas = 4) {
    for (let i = 0; i < tentativas; i++) {
      try {
        return await provider.getChargeStatus(externalId);
      } catch (e: unknown) {
        const err = e as { response?: { status?: number; headers?: Record<string, string> } };
        if (err?.response?.status === 429 && i < tentativas - 1) {
          const retryAfter = Number(err.response.headers?.['retry-after']);
          const espera = retryAfter > 0 ? retryAfter * 1000 : (i + 1) * 2000;
          await this.sleep(espera);
          continue;
        }
        throw e;
      }
    }
    return null;
  }

  /** Reconciliação de todas as faturas em aberto com cobrança gerada. */
  async reconcileTenant(tenantId: string) {
    const abertas = await this.prisma.invoice.findMany({
      where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, externalId: { not: null }, providerAccountId: { not: null } },
      take: 300,
    });

    // Cache do provider por conta: evita decifrar credenciais a cada fatura.
    const providers = new Map<string, Awaited<ReturnType<typeof this.factory.forAccount>>>();
    let baixadas = 0;
    for (const inv of abertas) {
      try {
        let provider = providers.get(inv.providerAccountId!);
        if (!provider) { provider = await this.factory.forAccount(inv.providerAccountId!); providers.set(inv.providerAccountId!, provider); }
        const st = await this.statusComRetry(provider, inv.externalId!);
        if (!st) continue; // rate limit persistente: tenta de novo na próxima rodada
        if (st.status === 'PAGA') {
          if (await this.baixar(tenantId, inv.id, inv.customerId, undefined, st.pagoEm)) baixadas++;
        } else if (st.status === 'VENCIDA' && inv.status !== 'VENCIDA') {
          await this.prisma.invoice.update({ where: { id: inv.id }, data: { status: 'VENCIDA' } });
        }
      } catch (e) {
        this.logger.warn(`Falha ao conciliar fatura ${inv.id}: ${String(e)}`);
      }
      // Pausa entre consultas para não estourar o rate limit do gateway.
      await this.sleep(250);
    }
    return { verificadas: abertas.length, baixadas };
  }

  /** Baixa + pausa régua + confirmação (mesma lógica do webhook). */
  private async baixar(tenantId: string, invoiceId: string, customerId: string, nome?: string, pagoEm?: Date): Promise<boolean> {
    // Baixa idempotente: se a fatura já foi paga (pelo webhook ou outra execução
    // da conciliação), não repete a baixa nem a mensagem de confirmação.
    const baixa = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, status: { not: 'PAGA' } },
      data: { status: 'PAGA', pagoEm: pagoEm ?? new Date() },
    });
    if (baixa.count === 0) return false;
    await this.prisma.messageDispatch.updateMany({
      where: { tenantId, invoiceId, status: 'FILA' },
      data: { status: 'IGNORADO', erro: 'Pagamento confirmado (conciliação)' },
    });
    void nome;
    await this.notify.confirmarPagamento(tenantId, invoiceId, customerId);
    return true;
  }
}
