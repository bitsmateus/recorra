import { Injectable } from '@nestjs/common';
import { RiskBand } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { bandFromScore } from './bands';
import { computeFeatures } from './features';

interface RiskFactor {
  fator: string;
  pontos: number;
  detalhe: string;
}

@Injectable()
export class RiskScoringService {
  constructor(private readonly prisma: PrismaService) {}

  bandFromScore(score: number): RiskBand {
    return bandFromScore(score) as RiskBand;
  }

  async scoreCustomer(tenantId: string, customerId: string) {
    const feature = await this.prisma.paymentHistoryFeature.findUnique({ where: { customerId } });
    const customer = await this.prisma.customer.findFirstOrThrow({ where: { id: customerId, tenantId } });

    const factors: RiskFactor[] = [];
    let score = 20;

    const atrasos = feature?.atrasosQtd ?? 0;
    const atrasoMedio = feature?.atrasoMedioDias ?? 0;
    const pagas = feature?.faturasPagas ?? 0;
    const vencidas = feature?.faturasVencidas ?? 0;
    const taxaResposta = feature?.taxaResposta ?? 0;

    if (atrasos >= 6) factors.push({ fator: 'atrasos', pontos: 30, detalhe: `${atrasos} atrasos no historico` });
    else if (atrasos >= 3) factors.push({ fator: 'atrasos', pontos: 18, detalhe: `${atrasos} atrasos` });
    else if (atrasos >= 1) factors.push({ fator: 'atrasos', pontos: 8, detalhe: `${atrasos} atraso(s)` });

    if (atrasoMedio >= 15) factors.push({ fator: 'atraso_medio', pontos: 20, detalhe: `media de ${Math.round(atrasoMedio)} dias de atraso` });
    else if (atrasoMedio >= 5) factors.push({ fator: 'atraso_medio', pontos: 10, detalhe: `media de ${Math.round(atrasoMedio)} dias` });

    const total = pagas + vencidas;
    if (total > 0) {
      const ratio = vencidas / total;
      if (ratio >= 0.5) factors.push({ fator: 'proporcao_vencidas', pontos: 20, detalhe: `${Math.round(ratio * 100)}% das faturas vencidas` });
      else if (ratio >= 0.2) factors.push({ fator: 'proporcao_vencidas', pontos: 10, detalhe: `${Math.round(ratio * 100)}% vencidas` });
      else factors.push({ fator: 'bom_historico', pontos: -10, detalhe: 'maioria das faturas paga em dia' });
    }

    const tempoCasaDias = (Date.now() - customer.createdAt.getTime()) / 86400000;
    if (total === 0 && tempoCasaDias < 60) {
      factors.push({ fator: 'cliente_novo', pontos: 8, detalhe: 'cliente novo, sem historico' });
    }

    if (taxaResposta >= 0.5) factors.push({ fator: 'engajamento', pontos: -8, detalhe: 'responde as mensagens' });

    score += factors.reduce((sum, f) => sum + f.pontos, 0);
    score = Math.max(0, Math.min(100, Math.round(score)));
    const faixa = this.bandFromScore(score);

    const [criado] = await this.prisma.$transaction([
      this.prisma.riskScore.create({
        data: { tenantId, customerId, score, faixa, fatores: factors as unknown as object },
      }),
      // Espelha a faixa no cliente para filtro/paginação por risco no banco.
      this.prisma.customer.update({ where: { id: customerId }, data: { faixaAtual: faixa } }),
    ]);
    return criado;
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
