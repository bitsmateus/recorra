import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { getPlan, PlanTier, Feature, featureEnabled } from './plans';
import { computeSaasBill, checkLimits, Usage } from './metering';

/** Billing do próprio SaaS: medição de uso, fatura por consumo e limites. */
@Injectable()
export class BillingSaasService {
  constructor(private readonly prisma: PrismaService) {}

  private competenciaAtual(): string {
    return new Date().toISOString().slice(0, 7); // AAAA-MM
  }
  private inicioMes(): Date {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Uso do tenant no mês corrente. */
  async usage(tenantId: string): Promise<Usage & { usuarios: number }> {
    const inicio = this.inicioMes();
    const [clientes, disparos, cobrancas, usuarios] = await Promise.all([
      this.prisma.customer.count({ where: { tenantId } }),
      this.prisma.messageDispatch.count({ where: { tenantId, createdAt: { gte: inicio }, status: { not: 'IGNORADO' } } }),
      this.prisma.invoice.count({ where: { tenantId, createdAt: { gte: inicio } } }),
      this.prisma.user.count({ where: { tenantId, ativo: true } }),
    ]);
    return { clientes, disparos, cobrancas, usuarios };
  }

  /** Plano atual + fatura estimada + limites/avisos. */
  async myPlan(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const uso = await this.usage(tenantId);
    const plan = getPlan(tenant.plano as PlanTier);
    const fatura = computeSaasBill(tenant.plano as PlanTier, uso);
    const limites = checkLimits(tenant.plano as PlanTier, uso);
    const overrides = (tenant.featureFlags as Partial<Record<Feature, boolean>>) ?? undefined;
    const features = plan.features.reduce((acc, f) => ({ ...acc, [f]: true }), {} as Record<string, boolean>);
    return { plano: plan, uso, fatura, limites, features: { ...features, ...(overrides ?? {}) } };
  }

  /** Verifica se o tenant tem uma feature liberada (para enforcement). */
  async hasFeature(tenantId: string, feature: Feature): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const overrides = (tenant.featureFlags as Partial<Record<Feature, boolean>>) ?? undefined;
    return featureEnabled(tenant.plano as PlanTier, feature, overrides);
  }

  /** Gera/atualiza a fatura da plataforma do tenant para a competência. */
  async gerarFatura(tenantId: string, competencia = this.competenciaAtual()) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const uso = await this.usage(tenantId);
    const bill = computeSaasBill(tenant.plano as PlanTier, uso);
    return this.prisma.platformInvoice.upsert({
      where: { tenantId_competencia: { tenantId, competencia } },
      create: {
        tenantId,
        competencia,
        plano: tenant.plano,
        valorBase: bill.base,
        disparos: uso.disparos,
        valorExcedente: bill.valorExcedente,
        valorTotal: bill.total,
      },
      update: { plano: tenant.plano, valorBase: bill.base, disparos: uso.disparos, valorExcedente: bill.valorExcedente, valorTotal: bill.total },
    });
  }

  /** Gera as faturas de todos os tenants ativos (rodar no fechamento do mês). */
  async gerarTodas(competencia = this.competenciaAtual()) {
    const tenants = await this.prisma.tenant.findMany({ where: { ativo: true }, select: { id: true } });
    for (const t of tenants) await this.gerarFatura(t.id, competencia);
    return { geradas: tenants.length, competencia };
  }

  listInvoices(tenantId: string) {
    return this.prisma.platformInvoice.findMany({ where: { tenantId }, orderBy: { competencia: 'desc' } });
  }
}
