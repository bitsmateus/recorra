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
      orderBy: { vencimento: 'asc' },
      include: { customer: { select: { nome: true } } },
    });
    if (!abertas.length) return { verificadas: 0, baixadas: 0, naoEncontradas: 0, exemplos: [], naoEncontradasIds: [] };

    // Agrupa por conta de gateway: dá para resolver a conta inteira de uma vez.
    const porConta = new Map<string, typeof abertas>();
    for (const inv of abertas) {
      const k = inv.providerAccountId!;
      const arr = porConta.get(k);
      if (arr) arr.push(inv); else porConta.set(k, [inv]);
    }

    let verificadas = 0;
    let baixadas = 0;
    let naoEncontradas = 0; // faturas cujo id não existe na lista do gateway (id divergente)
    const exemplos: { nome: string; valor: number; vencimento: Date }[] = []; // as "não encontradas", para o usuário conferir
    const naoEncontradasIds: string[] = []; // ids das que sumiram do gateway (para cancelar em lote)
    for (const [accountId, invs] of porConta) {
      let provider: Awaited<ReturnType<typeof this.factory.forAccount>>;
      try {
        provider = await this.factory.forAccount(accountId);
      } catch (e) {
        this.logger.warn(`Conta ${accountId} indisponível na conciliação: ${String(e)}`);
        continue;
      }

      // Caminho rápido: se o gateway lista pagamentos em lote, busca TODOS de uma vez e
      // casa por id. Cobre todas as faturas (antes só as primeiras 300 eram checadas — as
      // pagas fora desse recorte nunca eram baixadas).
      if (provider.listPayments) {
        let pagamentos: Awaited<ReturnType<NonNullable<typeof provider.listPayments>>> | null = null;
        try {
          pagamentos = await provider.listPayments();
        } catch (e) {
          this.logger.warn(`listPayments falhou (conta ${accountId}): ${String(e)}`);
        }
        if (pagamentos) {
          const mapa = new Map(pagamentos.map((p) => [p.externalId, p]));
          const semMatch: string[] = [];
          for (const inv of invs) {
            verificadas++;
            const p = mapa.get(inv.externalId!);
            if (!p) {
              naoEncontradas++;
              naoEncontradasIds.push(inv.id);
              if (semMatch.length < 8) semMatch.push(inv.externalId!);
              if (exemplos.length < 10) exemplos.push({ nome: (inv as { customer?: { nome?: string } }).customer?.nome ?? '—', valor: Number(inv.valor), vencimento: inv.vencimento });
              continue;
            }
            if (p.status === 'PAGA' && (await this.baixar(tenantId, inv.id, inv.customerId, undefined, p.pagoEm))) baixadas++;
          }
          if (semMatch.length) this.logger.warn(`Conciliação conta ${accountId}: ${naoEncontradas} fatura(s) sem correspondência no gateway (ex.: ${semMatch.join(', ')}). Pagamentos no gateway: ${pagamentos.length}.`);
          continue; // conta resolvida em lote
        }
      }

      // Fallback (gateway sem listagem em lote): uma consulta por fatura, com tolerância
      // a 429. Limita a 300 por rodada para não travar a requisição.
      for (const inv of invs.slice(0, 300)) {
        verificadas++;
        try {
          const st = await this.statusComRetry(provider, inv.externalId!);
          if (!st) continue;
          if (st.status === 'PAGA') {
            if (await this.baixar(tenantId, inv.id, inv.customerId, undefined, st.pagoEm)) baixadas++;
          } else if (st.status === 'VENCIDA' && inv.status !== 'VENCIDA') {
            await this.prisma.invoice.update({ where: { id: inv.id }, data: { status: 'VENCIDA' } });
          }
        } catch (e) {
          this.logger.warn(`Falha ao conciliar fatura ${inv.id}: ${String(e)}`);
        }
        await this.sleep(250);
      }
    }
    return { verificadas, baixadas, naoEncontradas, exemplos, naoEncontradasIds };
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
