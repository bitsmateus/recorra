import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelType, DunningRule, DunningStep, SourceSystem } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ChannelFactory } from '@/modules/channels/channel.factory';
import { ConnectorFactory } from '@/modules/connectors/connector.factory';
import { RiskScoringService } from '@/modules/risk/risk-scoring.service';
import { renderTemplate, renderPositional, money, dateBR } from './template.util';
import { isWithinWindow, nextAllowedSlot, withinDailyLimit, zonedSlotToUtc } from './windows';
import { channelChain } from './fallback';
import { pickVariant } from './abtest';
import { resolverBotoesParaEnvio, BotaoMapeado } from '@/modules/channels/meta-graph';
import { PaymentProviderFactory } from '@/modules/payments/payment-provider.factory';
import { assinarPagamento } from '@/modules/payments/pay-token';

type RuleWithSteps = DunningRule & { steps: DunningStep[] };

/** Seleção determinística compartilhável/testável. A lista deve estar em ordem de criação. */
export function selecionarRegua<T extends { id: string; faixaRisco: string | null; ativo: boolean }>(
  regras: T[], usarFaixaRisco: boolean, faixa: string | null, reguaPadraoId?: string | null,
): T | null {
  const ativas = regras.filter((r) => r.ativo);
  if (!usarFaixaRisco) {
    return ativas.find((r) => r.id === reguaPadraoId)
      ?? ativas.find((r) => r.faixaRisco === null)
      ?? ativas[0]
      ?? null;
  }
  return ativas.find((r) => r.faixaRisco === faixa)
    ?? ativas.find((r) => r.faixaRisco === null)
    ?? null;
}

/** Algum dos textos referencia a variável {{pix}}? (puro/testável) */
export function referenciaPix(...textos: (string | null | undefined)[]): boolean {
  return /\{\{\s*pix\s*\}\}/i.test(textos.filter(Boolean).join(' '));
}

@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelFactory,
    private readonly risk: RiskScoringService,
    private readonly payments: PaymentProviderFactory,
    private readonly connectors: ConnectorFactory,
  ) {}

  /** O passo referencia dado de pagamento ({{pix}}/{{boleto}}/{{link}}) em algum lugar? */
  private usaPagamento(step: DunningStep): { pix: boolean; boleto: boolean } {
    const botoes = Array.isArray(step.templateBotoes) ? JSON.stringify(step.templateBotoes) : '';
    const texto = [step.template, step.emailAssunto, ...(step.templateParams ?? []), botoes].filter(Boolean).join(' ');
    return {
      pix: /\{\{\s*pix\s*\}\}/i.test(texto),
      boleto: /\{\{\s*(boleto|link|linkpagamento|pagamento)\s*\}\}/i.test(texto),
    };
  }

  /**
   * Garante Pix/boleto na fatura, buscando na fonte certa quando falta:
   *  - Gateway: Pix copia-e-cola.
   *  - ERP (SGP, IXC...): 2ª via do título (Pix + boleto), como "Imprimir Pix" no ERP.
   * Nunca lança: se falhar, o worker sinaliza o campo vazio no envio.
   */
  private async garantirDadosPagamento<T extends {
    id: string; pixCopiaCola?: string | null; boletoLinha?: string | null; boletoUrl?: string | null;
    externalId?: string | null; providerAccountId?: string | null;
    sourceSystem?: SourceSystem | null; sourceExternalId?: string | null;
  }>(inv: T, tenantId: string, precisaPix: boolean, precisaBoleto: boolean): Promise<T> {
    // Gateway: só o Pix é buscável sob demanda.
    if (inv.providerAccountId && inv.externalId) {
      if (!precisaPix || inv.pixCopiaCola) return inv;
      try {
        const provider = await this.payments.forAccount(inv.providerAccountId);
        const pix = provider.getPixCopiaCola ? await provider.getPixCopiaCola(inv.externalId) : null;
        if (pix) {
          await this.prisma.invoice.update({ where: { id: inv.id }, data: { pixCopiaCola: pix } });
          return { ...inv, pixCopiaCola: pix };
        }
      } catch { /* mantém sem pix */ }
      return inv;
    }
    // ERP: 2ª via traz Pix + boleto juntos.
    const faltaPix = precisaPix && !inv.pixCopiaCola;
    const faltaBoleto = precisaBoleto && !inv.boletoUrl && !inv.boletoLinha;
    if (inv.sourceSystem && inv.sourceExternalId && (faltaPix || faltaBoleto)) {
      try {
        const connector = await this.connectors.forSystem(tenantId, inv.sourceSystem);
        const pag = connector?.fetchInvoicePayment ? await connector.fetchInvoicePayment(inv.sourceExternalId) : null;
        if (pag && (pag.pixCopiaCola || pag.boletoLinha || pag.boletoUrl || pag.linkPagamento)) {
          const data = {
            ...(pag.pixCopiaCola ? { pixCopiaCola: pag.pixCopiaCola } : {}),
            ...(pag.boletoLinha ? { boletoLinha: pag.boletoLinha } : {}),
            ...(pag.boletoUrl ? { boletoUrl: pag.boletoUrl } : {}),
            ...(pag.linkPagamento ? { linkPagamento: pag.linkPagamento } : {}),
          };
          await this.prisma.invoice.update({ where: { id: inv.id }, data });
          return { ...inv, ...data };
        }
      } catch (e) {
        this.logger.warn(`2a via ${inv.sourceSystem} falhou (titulo ${inv.sourceExternalId}): ${String(e)}`);
      }
    }
    return inv;
  }

  async runForTenant(tenantId: string, ref: Date = new Date()) {
    const stepsInc = { steps: { where: { ativo: true }, orderBy: { ordem: 'asc' as const } } };
    const [tenant, invoices, regras] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.prisma.invoice.findMany({
        where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, gestaoCobranca: 'ATIVA', contestada: false, customer: { ativo: true } },
        include: { customer: true },
      }),
      this.prisma.dunningRule.findMany({ where: { tenantId, ativo: true }, include: stepsInc, orderBy: { createdAt: 'asc' } }),
    ]);
    const usarFaixaRisco = tenant.usarFaixaRisco !== false;
    const faixaPorCliente = new Map<string, string>();

    let enfileirados = 0;
    for (const invoice of invoices) {
      const diffDias = Math.round((this.midnight(ref).getTime() - this.midnight(invoice.vencimento).getTime()) / 86400000);

      let faixa = faixaPorCliente.get(invoice.customerId) ?? invoice.customer.faixaAtual;
      if (usarFaixaRisco && !faixa) faixa = (await this.risk.scoreCustomer(tenantId, invoice.customerId)).faixa;
      if (faixa) faixaPorCliente.set(invoice.customerId, faixa);
      const rule = selecionarRegua(regras as RuleWithSteps[], usarFaixaRisco, faixa, tenant.reguaPadraoId);
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
    invoice: { id: string; customerId: string; valor: unknown; vencimento: Date; pixCopiaCola: string | null; boletoLinha?: string | null; boletoUrl?: string | null; linkPagamento: string | null; externalId?: string | null; providerAccountId?: string | null; sourceSystem?: SourceSystem | null; sourceExternalId?: string | null; customer: { nome: string; contrato: string | null } },
    step: DunningStep,
    rule: RuleWithSteps,
    opts?: { imediato?: boolean },
  ) {
    let variante: string | null = null;
    let template = step.template;
    if (step.abTest && step.templateB) {
      variante = pickVariant(`${invoice.customerId}:${step.id}`);
      if (variante === 'B') template = step.templateB;
    }

    // Se o passo usa {{pix}}/{{boleto}} e a fatura ainda não tem o dado, busca na
    // fonte (gateway ou ERP) agora — senão o campo iria vazio e o WhatsApp recusa.
    const precisa = this.usaPagamento(step);
    let inv = invoice;
    if (precisa.pix || precisa.boleto) inv = await this.garantirDadosPagamento(invoice, tenantId, precisa.pix, precisa.boleto);

    const vars = {
      nome: inv.customer.nome.split(' ')[0],
      valor: money(Number(inv.valor)),
      vencimento: dateBR(inv.vencimento),
      pix: inv.pixCopiaCola ?? '',
      boleto: inv.boletoUrl ?? inv.boletoLinha ?? '',
      // No SGP/boleto o link do boleto serve de link de pagamento — fallback.
      link: inv.linkPagamento ?? inv.boletoUrl ?? '',
      // Token da página de pagamento (sufixo do botão de URL fixo da Recorrai).
      pagina: assinarPagamento(inv.id),
      contrato: inv.customer.contrato ?? '',
    };

    // Canal oficial: envia como template aprovado (nome + parâmetros na ordem {{1}}, {{2}}...).
    // Cada templateParams do passo é uma variável Recorrai (ex.: "{{nome}}") resolvida aqui por cliente.
    // Um template aprovado sem variáveis também é válido — não exigir templateParams aqui.
    const usaTemplate = !!step.templateName;
    const templateParams = usaTemplate ? step.templateParams.map((tok) => renderTemplate(tok, vars)) : [];
    const conteudo = usaTemplate ? renderPositional(template, templateParams) : renderTemplate(template, vars);
    // Botões dinâmicos (link/pix): resolve o token de cada botão por cliente.
    const templateBotoes = usaTemplate
      ? resolverBotoesParaEnvio(step.templateBotoes as BotaoMapeado[] | null, (tok) => renderTemplate(tok, vars))
      : [];

    const cadeia = channelChain(step.canal, step.canaisFallback) as ChannelType[];
    // Ação manual ("Disparar agora" na Esteira) envia imediatamente, ignorando a
    // janela de horário da régua — que só governa os disparos automáticos.
    const agendadoPara = opts?.imediato ? new Date() : this.proximoSlot(timezone, rule);

    await this.prisma.messageDispatch.create({
      data: {
        tenantId,
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        ruleId: rule.id,
        ruleNome: rule.nome,
        canal: step.canal,
        channelAccountId: step.channelAccountId ?? undefined,
        cadeiaCanais: cadeia,
        template,
        conteudo,
        assunto: step.emailAssunto ? renderTemplate(step.emailAssunto, vars) : null,
        templateName: usaTemplate ? step.templateName : null,
        templateParams,
        templateBotoes: templateBotoes.length ? (templateBotoes as unknown as object) : undefined,
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
    // Materializa o slot (fuso do tenant) no instante UTC correto — NÃO usar
    // setHours, que aplicaria o fuso do servidor (UTC no deploy) e enviaria fora
    // da janela permitida do tenant.
    return zonedSlotToUtc(agora, timezone, slot.addDias, slot.hora);
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

  /**
   * Disparo manual da etapa atual da régua para UMA fatura (botão na Esteira).
   * Escolhe o passo cujo offset melhor casa com os dias de atraso e enfileira — sem
   * os limites diários da rodada automática (é uma ação explícita do usuário).
   */
  async dispararManual(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId }, include: { customer: true } });
    if (!invoice) throw new NotFoundException('Fatura não encontrada');
    if (invoice.status === 'PAGA' || invoice.status === 'CANCELADA') throw new BadRequestException('Fatura não está em aberto.');
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const regras = await this.prisma.dunningRule.findMany({
      where: { tenantId, ativo: true },
      include: { steps: { where: { ativo: true }, orderBy: { ordem: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    const rule = selecionarRegua(regras as RuleWithSteps[], tenant.usarFaixaRisco !== false, invoice.customer.faixaAtual, tenant.reguaPadraoId);
    if (!rule || !rule.steps.length) throw new BadRequestException('Nenhuma régua ativa com passos para este cliente.');
    const diff = Math.round((this.midnight(new Date()).getTime() - this.midnight(invoice.vencimento).getTime()) / 86400000);
    const step = [...rule.steps].filter((s) => s.offsetDias <= diff).pop() ?? rule.steps[0];
    await this.enqueueDispatch(tenantId, tenant.timezone, invoice, step, rule, { imediato: true });
    return { ok: true, canal: step.canal };
  }

  private midnight(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
}
