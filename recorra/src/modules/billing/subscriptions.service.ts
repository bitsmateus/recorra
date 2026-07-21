import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChargeMethod } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ChargesService } from '@/modules/payments/charges.service';
import { nextDueDate, podeRetentar, Ciclo } from './recurrence';

interface CreateSubDto {
  customerId: string;
  plano: string;
  valor: number;
  ciclo?: Ciclo;
  metodo?: ChargeMethod;
  diaVenc?: number;
  splitConfig?: unknown;
}

const MAX_TENTATIVAS = 4;

/**
 * Assinaturas/recorrência com retentativa automática.
 * O worker chama `runDue` (gera as cobranças do ciclo) e `runRetries`
 * (reprocessa inadimplentes) diariamente.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly charges: ChargesService,
  ) {}

  list(tenantId: string) {
    return this.prisma.subscription.findMany({
      where: { tenantId },
      include: { customer: { select: { nome: true, doc: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateSubDto) {
    const diaVenc = dto.diaVenc ?? 10;
    const ciclo = (dto.ciclo ?? 'MENSAL') as Ciclo;
    const proxima = this.primeiraCobranca(diaVenc, ciclo);
    return this.prisma.subscription.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        plano: dto.plano,
        valor: dto.valor,
        ciclo,
        metodo: dto.metodo ?? 'PIX_AUTOMATICO',
        diaVenc,
        proximaCobranca: proxima,
        splitConfig: (dto.splitConfig as object) ?? undefined,
        pixAutoStatus: dto.metodo === 'PIX_AUTOMATICO' ? 'pendente' : undefined,
      },
    });
  }

  async setStatus(tenantId: string, id: string, status: 'ATIVA' | 'PAUSADA' | 'CANCELADA') {
    const sub = await this.prisma.subscription.findFirst({ where: { id, tenantId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');
    return this.prisma.subscription.update({ where: { id }, data: { status } });
  }

  /**
   * Registra a autorização de Pix Automático (Res. BACEN 422/2025).
   * O fluxo de autorização em si é do gateway; aqui guardamos o id/estado.
   */
  async registrarPixAuto(tenantId: string, id: string, authId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id, tenantId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');
    return this.prisma.subscription.update({
      where: { id },
      data: { pixAutoAuthId: authId, pixAutoStatus: 'autorizado', metodo: 'PIX_AUTOMATICO' },
    });
  }

  /** Gera as cobranças das assinaturas cujo ciclo venceu (worker). */
  async runDue(ref: Date = new Date()) {
    const dueSubs = await this.prisma.subscription.findMany({
      where: { status: 'ATIVA', ativo: true, proximaCobranca: { lte: this.endOfDay(ref) } },
    });

    let geradas = 0;
    for (const sub of dueSubs) {
      const vencimento = sub.proximaCobranca ?? ref;

      // Claim otimista: avança o ciclo ANTES de faturar, com guarda no valor
      // atual de proximaCobranca. Só uma execução/worker vence — as demais veem
      // count=0 e pulam. Isso elimina a cobrança dupla (por crash entre criar a
      // fatura e avançar o ciclo, ou por dois workers processando o mesmo ciclo).
      // Trade-off: um crash logo após o claim perde este ciclo (mal menor que
      // cobrar em duplicidade); a próxima execução segue do ciclo seguinte.
      const claim = await this.prisma.subscription.updateMany({
        where: { id: sub.id, status: 'ATIVA', ativo: true, proximaCobranca: sub.proximaCobranca },
        data: {
          proximaCobranca: nextDueDate(sub.diaVenc, sub.ciclo as Ciclo, vencimento),
          tentativas: 0,
          ultimaTentativa: new Date(),
        },
      });
      if (claim.count === 0) continue;

      const invoice = await this.prisma.invoice.create({
        data: {
          tenantId: sub.tenantId,
          customerId: sub.customerId,
          descricao: `Assinatura ${sub.plano}`,
          valor: sub.valor,
          vencimento,
          metodo: sub.metodo,
          status: 'PENDENTE',
          origem: 'assinatura',
        },
      });

      // auto-gera a cobrança no gateway ativo do tenant, se houver
      await this.autoCharge(sub.tenantId, invoice.id, sub.metodo, sub.splitConfig);
      geradas++;
    }
    this.logger.log(`Assinaturas processadas: ${geradas}`);
    return { processadas: dueSubs.length, geradas };
  }

  /** Reprocessa assinaturas com fatura vencida: retenta ou marca inadimplente. */
  async runRetries(ref: Date = new Date()) {
    const subs = await this.prisma.subscription.findMany({ where: { status: 'ATIVA', ativo: true } });
    let retentadas = 0;
    let inadimplentes = 0;
    for (const sub of subs) {
      const vencida = await this.prisma.invoice.findFirst({
        where: { tenantId: sub.tenantId, customerId: sub.customerId, origem: 'assinatura', status: 'VENCIDA' },
        orderBy: { vencimento: 'desc' },
      });
      if (!vencida) continue;

      if (podeRetentar(sub.tentativas, MAX_TENTATIVAS)) {
        // Claim otimista no contador de tentativas: guarda no valor atual para
        // que dois workers não retentem/incrementem o mesmo ciclo em duplicidade.
        const claim = await this.prisma.subscription.updateMany({
          where: { id: sub.id, tentativas: sub.tentativas, status: 'ATIVA', ativo: true },
          data: { tentativas: { increment: 1 }, ultimaTentativa: ref },
        });
        if (claim.count === 0) continue;
        await this.autoCharge(sub.tenantId, vencida.id, sub.metodo, sub.splitConfig);
        retentadas++;
      } else {
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'INADIMPLENTE' } });
        inadimplentes++;
      }
    }
    return { retentadas, inadimplentes };
  }

  private async autoCharge(tenantId: string, invoiceId: string, metodo: ChargeMethod, splitConfig: unknown) {
    const account = await this.prisma.paymentProviderAccount.findFirst({ where: { tenantId, ativo: true } });
    if (!account) return; // sem gateway configurado: fatura fica sem cobrança até configurar
    try {
      const splits = Array.isArray(splitConfig) ? splitConfig : undefined;
      await this.charges.gerarCobranca(tenantId, invoiceId, account.id, metodo, splits as never, 'assinatura');
    } catch (e) {
      this.logger.warn(`Falha ao gerar cobrança da assinatura (fatura ${invoiceId}): ${String(e)}`);
    }
  }

  /** Primeira cobrança: no diaVenc deste mês se ainda não passou, senão no próximo ciclo. */
  private primeiraCobranca(diaVenc: number, ciclo: Ciclo): Date {
    const hoje = new Date();
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const candidato = new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(diaVenc, ultimoDia));
    if (candidato >= this.startOfDay(hoje)) return candidato;
    return nextDueDate(diaVenc, ciclo, candidato);
  }

  private startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  private endOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }
}
