import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { getPlan, PlanTier, Feature, featureEnabled } from './plans';
import { computeSaasBill, Usage } from './metering';

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
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { plan: true } });
    const uso = await this.usage(tenantId);
    const overrides = (tenant.featureFlags as Partial<Record<Feature, boolean>>) ?? undefined;

    // Plano efetivo: o do catálogo (planId) quando definido; senão o enum legado.
    // Cálculo inline para não mexer no metering.ts (puro/testado), que só conhece o enum.
    const p = tenant.plan
      ? {
          nome: tenant.plan.nome, preco: Number(tenant.plan.preco), sobConsulta: tenant.plan.sobConsulta,
          maxClientes: tenant.plan.maxClientes, disparosInclusos: tenant.plan.disparosInclusos,
          custoExcedente: Number(tenant.plan.custoExcedente), maxUsuarios: tenant.plan.maxUsuarios, features: tenant.plan.features,
        }
      : (() => {
          const e = getPlan(tenant.plano as PlanTier);
          return { nome: e.nome, preco: e.preco, sobConsulta: false, maxClientes: e.maxClientes, disparosInclusos: e.disparosInclusos, custoExcedente: e.custoExcedente, maxUsuarios: e.maxUsuarios, features: e.features as string[] };
        })();

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const excedentes = Math.max(0, uso.disparos - p.disparosInclusos);
    const valorExcedente = round2(excedentes * p.custoExcedente);
    const fatura = { base: p.preco, disparosInclusos: p.disparosInclusos, disparosExcedentes: excedentes, valorExcedente, total: round2(p.preco + valorExcedente) };

    const clientesOk = p.maxClientes < 0 || uso.clientes <= p.maxClientes;
    const usuariosOk = p.maxUsuarios < 0 || uso.usuarios <= p.maxUsuarios;
    const avisos: string[] = [];
    if (!clientesOk) avisos.push(`Limite de clientes do plano (${p.maxClientes}) excedido: ${uso.clientes}.`);
    if (!usuariosOk) avisos.push(`Limite de usuários do plano (${p.maxUsuarios}) excedido.`);
    if (p.maxClientes > 0 && uso.clientes >= p.maxClientes * 0.8 && clientesOk) avisos.push('Você está próximo do limite de clientes do plano.');
    const limites = { clientesOk, usuariosOk, avisos };

    const features = p.features.reduce((acc, f) => ({ ...acc, [f]: true }), {} as Record<string, boolean>);
    return { plano: p, uso, fatura, limites, features: { ...features, ...(overrides ?? {}) } };
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
