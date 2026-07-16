import { Injectable, Logger } from '@nestjs/common';
import { ChannelType, DunningRule, DunningStep } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ChannelFactory } from '@/modules/channels/channel.factory';
import { RiskScoringService } from '@/modules/risk/risk-scoring.service';
import { renderTemplate, renderPositional, money, dateBR } from './template.util';
import { isWithinWindow, nextAllowedSlot, withinDailyLimit } from './windows';
import { channelChain } from './fallback';
import { pickVariant } from './abtest';

type RuleWithSteps = DunningRule & { steps: DunningStep[] };

@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelFactory,
    private readonly risk: RiskScoringService,
  ) {}

  async runForTenant(tenantId: string, ref: Date = new Date()) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, contestada: false },
      include: { customer: true },
    });

    let enfileirados = 0;
    for (const invoice of invoices) {
      const diffDias = Math.round((this.midnight(ref).getTime() - this.midnight(invoice.vencimento).getTime()) / 86400000);

      let scoreRow = await this.risk.latest(tenantId, invoice.customerId);
      if (!scoreRow) scoreRow = await this.risk.scoreCustomer(tenantId, invoice.customerId);

      const rule = (await this.prisma.dunningRule.findFirst({
        where: { tenantId, ativo: true, OR: [{ faixaRisco: scoreRow.faixa }, { faixaRisco: null }] },
        include: { steps: { where: { ativo: true }, orderBy: { ordem: 'asc' } } },
        orderBy: { faixaRisco: 'desc' },
      })) as RuleWithSteps | null;
      if (!rule) continue;

      const steps = rule.steps.filter((s) => s.offsetDias === diffDias);
      for (const step of steps) {
        if (await this.jaDisparadoHoje(tenantId, invoice.id, step.canal, ref)) continue;
        if (await this.optOut(invoice.customerId, step.canal)) continue;
        if (!(await this.dentroLimiteDiario(tenantId, invoice.customerId, rule.maxMsgsDia, ref))) continue;

        await this.enqueueDispatch(tenantId, tenant.timezone, invoice, step, rule);
        enfileirados++;
      }
    }
    return { enfileirados, faturas: invoices.length };
  }

  private async enqueueDispatch(
    tenantId: string,
    timezone: string,
    invoice: { id: string; customerId: string; valor: unknown; vencimento: Date; pixCopiaCola: string | null; linkPagamento: string | null; customer: { nome: string; contrato: string | null } },
    step: DunningStep,
    rule: RuleWithSteps,
  ) {
    let variante: string | null = null;
    let template = step.template;
    if (step.abTest && step.templateB) {
      variante = pickVariant(`${invoice.customerId}:${step.id}`);
      if (variante === 'B') template = step.templateB;
    }

    const vars = {
      nome: invoice.customer.nome.split(' ')[0],
      valor: money(Number(invoice.valor)),
      vencimento: dateBR(invoice.vencimento),
      pix: invoice.pixCopiaCola ?? '',
      link: invoice.linkPagamento ?? '',
      contrato: invoice.customer.contrato ?? '',
    };

    // Canal oficial: envia como template aprovado (nome + parâmetros na ordem {{1}}, {{2}}...).
    // Cada templateParams do passo é uma variável Recorra (ex.: "{{nome}}") resolvida aqui por cliente.
    // Um template aprovado sem variáveis também é válido — não exigir templateParams aqui.
    const usaTemplate = !!step.templateName;
    const templateParams = usaTemplate ? step.templateParams.map((tok) => renderTemplate(tok, vars)) : [];
    const conteudo = usaTemplate ? renderPositional(template, templateParams) : renderTemplate(template, vars);

    const cadeia = channelChain(step.canal, step.canaisFallback) as ChannelType[];
    const agendadoPara = this.proximoSlot(timezone, rule);

    await this.prisma.messageDispatch.create({
      data: {
        tenantId,
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        canal: step.canal,
        channelAccountId: step.channelAccountId ?? undefined,
        cadeiaCanais: cadeia,
        template,
        conteudo,
        templateName: usaTemplate ? step.templateName : null,
        templateParams,
        variante,
        status: 'FILA',
        agendadoPara,
      },
    });
  }

  private proximoSlot(timezone: string, rule: RuleWithSteps): Date {
    const agora = new Date();
    const { hora, diaSemana } = this.horaLocal(agora, timezone);
    const cfg = { inicioHora: rule.janelaInicio, fimHora: rule.janelaFim, diasUteisSomente: rule.diasUteisSomente };
    if (isWithinWindow(hora, diaSemana, cfg)) return agora;
    const slot = nextAllowedSlot(hora, diaSemana, cfg);
    const d = new Date(agora);
    d.setDate(d.getDate() + slot.addDias);
    d.setHours(slot.hora, 0, 0, 0);
    return d;
  }

  private horaLocal(d: Date, timezone: string): { hora: number; diaSemana: number } {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false, weekday: 'short' });
      const parts = fmt.formatToParts(d);
      const hora = Number(parts.find((p) => p.type === 'hour')?.value ?? d.getHours());
      const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
      const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return { hora: hora === 24 ? 0 : hora, diaSemana: map[wd] ?? d.getDay() };
    } catch {
      return { hora: d.getHours(), diaSemana: d.getDay() };
    }
  }

  private async dentroLimiteDiario(tenantId: string, customerId: string, maxMsgsDia: number | null, ref: Date) {
    if (!maxMsgsDia || maxMsgsDia <= 0) return true;
    const inicio = this.midnight(ref);
    const fim = new Date(inicio.getTime() + 86400000);
    const enviadosHoje = await this.prisma.messageDispatch.count({
      where: { tenantId, customerId, createdAt: { gte: inicio, lt: fim }, status: { not: 'IGNORADO' } },
    });
    return withinDailyLimit(enviadosHoje, maxMsgsDia);
  }

  private async jaDisparadoHoje(tenantId: string, invoiceId: string, canal: ChannelType, ref: Date) {
    const inicio = this.midnight(ref);
    const fim = new Date(inicio.getTime() + 86400000);
    const count = await this.prisma.messageDispatch.count({
      where: { tenantId, invoiceId, canal, createdAt: { gte: inicio, lt: fim } },
    });
    return count > 0;
  }

  private async optOut(customerId: string, canal: ChannelType) {
    const revogado = await this.prisma.consent.findFirst({ where: { customerId, canal, status: 'REVOGADO' } });
    return !!revogado;
  }

  private midnight(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
}
