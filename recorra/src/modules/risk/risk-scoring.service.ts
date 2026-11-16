import { Injectable } from '@nestjs/common';
import { RiskBand } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { bandFromScore } from './bands';
import { computeFeatures } from './features';
import { avaliarRisco } from './avaliacao';

@Injectable()
export class RiskScoringService {
  constructor(private readonly prisma: PrismaService) {}

  bandFromScore(score: number): RiskBand {
    return bandFromScore(score) as RiskBand;
  }

  /**
   * Score v2: últimas cobranças PAGAS + vencidas em aberto (ver avaliacao.ts). Se o
   * cliente tem faixa MANUAL, o score continua sendo calculado e gravado (para
   * consulta), mas a faixa que vale — e que escolhe a régua — é a manual.
   */
  async scoreCustomer(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirstOrThrow({ where: { id: customerId, tenantId } });
    const faturas = await this.prisma.invoice.findMany({
      where: { tenantId, customerId, gestaoCobranca: 'ATIVA', status: { in: ['PAGA', 'VENCIDA', 'PENDENTE'] } },
      select: { status: true, vencimento: true, pagoEm: true },
      orderBy: { vencimento: 'desc' },
      take: 60,
    });
    const a = avaliarRisco(faturas);
    const faixa = (customer.riscoManual ?? a.faixa) as RiskBand;
    const [criado] = await this.prisma.$transaction([
      this.prisma.riskScore.create({
        data: {
          tenantId, customerId, score: a.score, faixa: a.faixa as RiskBand,
          fatores: a.fatores as unknown as object, historico: a.historico as unknown as object, modeloVersao: 'ultimas-pagas-v2',
        },
      }),
      // Espelha a faixa que VALE no cliente (filtro/paginação e escolha da régua).
      this.prisma.customer.update({ where: { id: customerId }, data: { faixaAtual: faixa } }),
    ]);
    return { ...criado, faixa };
  }

  /** Define a faixa à mão (sobrepõe a calculada) ou volta ao automático (faixa null). */
  async definirManual(tenantId: string, customerId: string, faixa: RiskBand | null, motivo: string | undefined, userId: string) {
    await this.prisma.customer.findFirstOrThrow({ where: { id: customerId, tenantId } });
    await this.prisma.customer.update({
      where: { id: customerId },
      data: faixa
        ? { riscoManual: faixa, riscoManualMotivo: motivo?.trim() || null, riscoManualPorId: userId, riscoManualEm: new Date(), faixaAtual: faixa }
        : { riscoManual: null, riscoManualMotivo: null, riscoManualPorId: null, riscoManualEm: null },
    });
    // Recalcula: com manual, grava o score e mantém a faixa manual; sem, volta à calculada.
    return this.scoreCustomer(tenantId, customerId);
  }

  /** O que o painel do cliente mostra: score calculado, motivos, histórico e o ajuste manual. */
  async painel(tenantId: string, customerId: string) {
    const [c, ultimo] = await Promise.all([
      this.prisma.customer.findFirstOrThrow({
        where: { id: customerId, tenantId },
        select: { faixaAtual: true, riscoManual: true, riscoManualMotivo: true, riscoManualEm: true, riscoManualPorId: true },
      }),
      this.latest(tenantId, customerId),
    ]);
    const por = c.riscoManualPorId
      ? await this.prisma.user.findUnique({ where: { id: c.riscoManualPorId }, select: { nome: true } })
      : null;
    return {
      faixa: c.faixaAtual,
      score: ultimo?.score ?? null,
      faixaCalculada: ultimo?.faixa ?? null,
      fatores: ultimo?.fatores ?? [],
      historico: ultimo?.historico ?? [],
      calculadoEm: ultimo?.calculadoEm ?? null,
      modelo: ultimo?.modeloVersao ?? null,
      manual: c.riscoManual ? { faixa: c.riscoManual, motivo: c.riscoManualMotivo, em: c.riscoManualEm, por: por?.nome ?? null } : null,
    };
  }

  async latest(tenantId: string, customerId: string) {
    return this.prisma.riskScore.findFirst({
      where: { tenantId, customerId },
      orderBy: { calculadoEm: 'desc' },
    });
  }

  async recomputeFeatures(tenantId: string, customerId: string) {
    const invoices = await this.prisma.invoice.findMany({ where: { tenantId, customerId, gestaoCobranca: 'ATIVA' } });
    const [enviadas, lidas] = await Promise.all([
      this.prisma.messageDispatch.count({ where: { tenantId, customerId, status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] } } }),
      this.prisma.messageDispatch.count({ where: { tenantId, customerId, status: 'LIDO' } }),
    ]);

    const f = computeFeatures(invoices, { enviadas, lidas });

    return this.prisma.paymentHistoryFeature.upsert({
      where: { customerId },
      create: { tenantId, customerId, ...f },
      update: { ...f },
    });
  }

  async evaluate(tenantId: string, customerId: string) {
    await this.recomputeFeatures(tenantId, customerId);
    return this.scoreCustomer(tenantId, customerId);
  }

  async evaluateAll(tenantId: string) {
    const customers = await this.prisma.customer.findMany({ where: { tenantId }, select: { id: true } });
    for (const c of customers) await this.evaluate(tenantId, c.id);
    return { avaliados: customers.length };
  }
}
