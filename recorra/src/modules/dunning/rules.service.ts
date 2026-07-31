import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RiskBand } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { SaveRuleDto } from './dto/rule.dto';
import { NICHO_TEMPLATES, findNicho } from './nicho-templates';
import { evaluateAb, Variante } from './abtest';
import { selecionarRegua, DunningService } from './dunning.service';
import { erroMapeamentoBotoes } from '@/modules/channels/meta-graph';

/** Card do kanban de andamento (uma fatura em aberto posicionada na sua etapa). */
export interface AndamentoCard {
  invoiceId: string;
  customerId: string;
  nome: string;
  valor: number;
  vencimento: Date;
  diffDias: number;
  ultimoDisparo: { status: string; canal: string; quando: Date } | null;
  canal?: string; // canal do toque atual (último disparo, ou o do passo em que está) — p/ filtro
  pausada?: boolean; // cobrança deste cliente pausada (gestaoCobranca = PAUSADA)
  status?: string;
}

/** Rótulo do passo da régua a partir do offset em dias (relativo ao vencimento). */
function labelOffset(o: number): string {
  if (o < 0) return `${Math.abs(o)} dia${Math.abs(o) > 1 ? 's' : ''} antes`;
  if (o === 0) return 'No dia do vencimento';
  return `${o} dia${o > 1 ? 's' : ''} depois`;
}

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dunning: DunningService,
  ) {}

  /** Pausa/retoma a cobrança automática de faturas (gestaoCobranca). Em lote. */
  async pausarCobranca(tenantId: string, invoiceIds: string[], pausar: boolean) {
    const ids = [...new Set(invoiceIds)].filter(Boolean);
    if (!ids.length) return { alteradas: 0 };
    const r = await this.prisma.invoice.updateMany({
      where: { id: { in: ids }, tenantId, status: { in: ['PENDENTE', 'VENCIDA'] } },
      data: { gestaoCobranca: pausar ? 'PAUSADA' : 'ATIVA' },
    });
    // Ao pausar, segura o que já estava na fila dessas faturas.
    if (pausar && r.count) {
      await this.prisma.messageDispatch.updateMany({
        where: { tenantId, invoiceId: { in: ids }, status: 'FILA' },
        data: { status: 'IGNORADO', erro: 'Cobrança pausada manualmente' },
      });
    }
    return { alteradas: r.count };
  }

  /** Dispara a etapa atual da régua para várias faturas (botão da Esteira). */
  async dispararLote(tenantId: string, invoiceIds: string[]) {
    const ids = [...new Set(invoiceIds)].filter(Boolean);
    let enfileirados = 0;
    const erros: { id: string; erro: string }[] = [];
    for (const id of ids) {
      try { await this.dunning.dispararManual(tenantId, id); enfileirados++; }
      catch (e) { erros.push({ id, erro: e instanceof Error ? e.message : String(e) }); }
    }
    return { enfileirados, falhas: erros.length, erros: erros.slice(0, 5) };
  }

  /** Descrição legível de um erro do Prisma (código + alvo) para diagnóstico. */
  private detalheErro(e: unknown): string {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = e.meta ? ` ${JSON.stringify(e.meta)}` : '';
      return `${e.code}: ${e.message.split('\n').pop()?.trim() ?? e.message}${meta}`;
    }
    return e instanceof Error ? e.message : String(e);
  }

  /** Cliente inadimplente = tem fatura em aberto (não contestada, gestão ativa). */
  private inadimplenteWhere(tenantId: string, faixa?: RiskBand | null): Prisma.CustomerWhereInput {
    return {
      tenantId,
      ativo: true,
      ...(faixa ? { faixaAtual: faixa } : {}),
      invoices: { some: { status: { in: ['PENDENTE', 'VENCIDA'] }, gestaoCobranca: 'ATIVA', contestada: false } },
    };
  }

  async list(tenantId: string) {
    const [tenant, reguas] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { usarFaixaRisco: true, reguaPadraoId: true } }),
      this.prisma.dunningRule.findMany({
        where: { tenantId },
        include: {
          steps: { orderBy: { ordem: 'asc' } },
          // Transparência: quais campanhas usam esta régua (somente leitura).
          campaigns: { select: { id: true, nome: true, status: true }, orderBy: { nome: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const usarFaixaRisco = tenant?.usarFaixaRisco !== false;
    const faixas = [RiskBand.BOM, RiskBand.ATENCAO, RiskBand.RISCO];
    const [totalInad, semRisco, ...porFaixa] = await Promise.all([
      this.prisma.customer.count({ where: this.inadimplenteWhere(tenantId) }),
      this.prisma.customer.count({ where: { AND: [this.inadimplenteWhere(tenantId), { faixaAtual: null }] } }),
      ...faixas.map((faixa) => this.prisma.customer.count({ where: this.inadimplenteWhere(tenantId, faixa) })),
    ]);
    const efetivaSimples = selecionarRegua(reguas, false, null, tenant?.reguaPadraoId);
    const cobertura = new Map<string, number>();
    if (!usarFaixaRisco && efetivaSimples) cobertura.set(efetivaSimples.id, totalInad);
    if (usarFaixaRisco) {
      faixas.forEach((faixa, i) => {
        const efetiva = selecionarRegua(reguas, true, faixa);
        if (efetiva) cobertura.set(efetiva.id, (cobertura.get(efetiva.id) ?? 0) + porFaixa[i]);
      });
    }
    const comCobertura = reguas.map((r) => ({
      ...r,
      inadimplentesCobertos: cobertura.get(r.id) ?? 0,
      reguaEfetiva: usarFaixaRisco ? cobertura.has(r.id) : r.id === efetivaSimples?.id,
      semRiscoCalculado: semRisco,
    }));
    return comCobertura;
  }

  /**
   * "Andamento" (kanban da régua): para a régua ativa (ou a escolhida), coloca cada
   * fatura em aberto na ETAPA em que está agora — derivada de vencimento × hoje × os
   * passos da própria régua. Nada é gravado: a etapa é calculada na hora e "anda"
   * sozinha conforme o tempo passa e os disparos saem. Colunas = passos da régua +
   * Aguardando início + Pagas/Encerradas + Sem contato.
   */
  async andamento(tenantId: string, ruleId?: string) {
    const [tenant, reguas] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { usarFaixaRisco: true, reguaPadraoId: true } }),
      this.prisma.dunningRule.findMany({
        where: { tenantId, ativo: true },
        include: { steps: { where: { ativo: true }, orderBy: { offsetDias: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const usarFaixaRisco = tenant?.usarFaixaRisco !== false;
    const opcoesReguas = reguas.map((r) => ({ id: r.id, nome: r.nome, faixaRisco: r.faixaRisco }));

    // Régua alvo: a escolhida; senão a padrão (modo simples); senão a 1ª ativa.
    const regua =
      (ruleId ? reguas.find((r) => r.id === ruleId) : undefined) ??
      (usarFaixaRisco ? undefined : selecionarRegua(reguas, false, null, tenant?.reguaPadraoId) ?? undefined) ??
      reguas[0];
    if (!regua) return { regua: null, reguas: opcoesReguas, usarFaixaRisco, colunas: [] };

    // Passos distintos por offset — cada fatura entra no offset da etapa atual.
    const offsets = [...new Set(regua.steps.map((s) => s.offsetDias))].sort((a, b) => a - b);
    // No modo faixa, filtra pela faixa da régua (régua "de todas as faixas" = sem filtro).
    const faixa = usarFaixaRisco ? regua.faixaRisco : null;
    const filtroCliente = { ativo: true, ...(faixa ? { faixaAtual: faixa } : {}) };

    const seteDias = new Date(Date.now() - 7 * 86400000);
    const [abertas, encerradas] = await Promise.all([
      this.prisma.invoice.findMany({
        // Inclui PAUSADA para o card mostrar o estado e permitir retomar (a régua só
        // dispara nas ATIVAS; a pausada fica visível mas parada na sua etapa).
        where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, gestaoCobranca: { in: ['ATIVA', 'PAUSADA'] }, contestada: false, customer: filtroCliente },
        include: { customer: { select: { id: true, nome: true, telefone: true, email: true } } },
        orderBy: { vencimento: 'asc' },
        take: 3000,
      }),
      this.prisma.invoice.findMany({
        where: { tenantId, status: { in: ['PAGA', 'CANCELADA'] }, updatedAt: { gte: seteDias }, customer: filtroCliente },
        include: { customer: { select: { id: true, nome: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
    ]);

    // Último disparo por fatura (status + quando) para enriquecer o card.
    const invIds = abertas.map((i) => i.id);
    const disparos = invIds.length
      ? await this.prisma.messageDispatch.findMany({
          where: { tenantId, invoiceId: { in: invIds } },
          orderBy: { createdAt: 'desc' },
          select: { invoiceId: true, status: true, canal: true, enviadoEm: true, agendadoPara: true, createdAt: true },
        })
      : [];
    const ultimo = new Map<string, (typeof disparos)[number]>();
    for (const d of disparos) if (d.invoiceId && !ultimo.has(d.invoiceId)) ultimo.set(d.invoiceId, d);

    const h = new Date();
    const hojeUtc = Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate());
    const diffDe = (v: Date) => Math.round((hojeUtc - Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())) / 86400000);

    // Canal de cada offset (o do primeiro passo naquele dia) — usado no card e no filtro.
    const canalDoOffset = new Map<number, string>();
    for (const s of regua.steps) if (!canalDoOffset.has(s.offsetDias)) canalDoOffset.set(s.offsetDias, s.canal);

    const colunas: { key: string; label: string; cards: AndamentoCard[] }[] = [
      { key: 'aguardando', label: 'Aguardando início', cards: [] },
      ...offsets.map((o) => ({ key: `step:${o}`, label: labelOffset(o), cards: [] as AndamentoCard[] })),
      { key: 'falharam', label: 'Falharam', cards: [] },
      { key: 'encerradas', label: 'Pagas / Encerradas', cards: [] },
      { key: 'sem-contato', label: 'Sem contato', cards: [] },
    ];
    const col = (k: string) => colunas.find((c) => c.key === k)!;

    for (const inv of abertas) {
      const c = inv.customer;
      const d = ultimo.get(inv.id);
      const atual = offsets.filter((o) => o <= diffDe(inv.vencimento)).pop();
      const card: AndamentoCard = {
        invoiceId: inv.id, customerId: c.id, nome: c.nome, valor: Number(inv.valor),
        vencimento: inv.vencimento, diffDias: diffDe(inv.vencimento),
        ultimoDisparo: d ? { status: d.status, canal: d.canal, quando: d.enviadoEm ?? d.agendadoPara ?? d.createdAt } : null,
        canal: d?.canal ?? (atual !== undefined ? canalDoOffset.get(atual) : undefined),
        pausada: inv.gestaoCobranca === 'PAUSADA',
      };
      if (!c.telefone?.trim() && !c.email?.trim()) { col('sem-contato').cards.push(card); continue; }
      // Último disparo falhou → coluna "Falharam" (destaca o problema em vez de esconder na etapa).
      if (d && (d.status === 'FALHA' || d.status === 'IGNORADO')) { col('falharam').cards.push(card); continue; }
      col(atual === undefined ? 'aguardando' : `step:${atual}`).cards.push(card);
    }
    for (const inv of encerradas) {
      col('encerradas').cards.push({
        invoiceId: inv.id, customerId: inv.customer.id, nome: inv.customer.nome, valor: Number(inv.valor),
        vencimento: inv.vencimento, diffDias: diffDe(inv.vencimento), ultimoDisparo: null, status: inv.status,
      });
    }

    return {
      regua: { id: regua.id, nome: regua.nome, steps: regua.steps.map((s) => ({ offsetDias: s.offsetDias, canal: s.canal })) },
      reguas: opcoesReguas,
      usarFaixaRisco,
      colunas: colunas.map((c) => ({ ...c, total: c.cards.length, valor: c.cards.reduce((s, x) => s + x.valor, 0) })),
    };
  }

  /** Config da cobrança automática + diagnóstico (faixas de inadimplentes sem régua). */
  async config(tenantId: string) {
    const [tenant, reguas] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { usarFaixaRisco: true, reguaPadraoId: true } }),
      this.prisma.dunningRule.findMany({ where: { tenantId, ativo: true }, select: { id: true, faixaRisco: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const usarFaixaRisco = tenant?.usarFaixaRisco !== false;
    const faixasSemRegua: { faixa: string; label: string; inadimplentes: number }[] = [];
    const temTodas = reguas.some((r) => !r.faixaRisco);
    if (usarFaixaRisco && !temTodas) {
      const cobertas = new Set(reguas.map((r) => r.faixaRisco).filter(Boolean));
      const LABEL: Record<string, string> = { BOM: 'Bom pagador', ATENCAO: 'Atenção', RISCO: 'Risco' };
      for (const faixa of ['BOM', 'ATENCAO', 'RISCO'] as const) {
        if (cobertas.has(faixa)) continue;
        const inadimplentes = await this.prisma.customer.count({ where: this.inadimplenteWhere(tenantId, faixa) });
        if (inadimplentes > 0) faixasSemRegua.push({ faixa, label: LABEL[faixa], inadimplentes });
      }
    }
    const semReguaAtiva = reguas.length === 0;
    const semRiscoCalculado = usarFaixaRisco
      ? await this.prisma.customer.count({ where: { AND: [this.inadimplenteWhere(tenantId), { faixaAtual: null }] } })
      : 0;
    // O id explícito é preferido; se ficou nulo/inválido, informa a mesma escolha
    // determinística usada pelo motor até o usuário selecionar outra.
    const reguaPadraoId = selecionarRegua(reguas.map((r) => ({ ...r, ativo: true })), false, null, tenant?.reguaPadraoId)?.id ?? null;
    return { usarFaixaRisco, reguaPadraoId, faixasSemRegua, semReguaAtiva, semRiscoCalculado };
  }

  async setUsarFaixaRisco(tenantId: string, usar: boolean) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { reguaPadraoId: true } });
    const regras = await this.prisma.dunningRule.findMany({ where: { tenantId, ativo: true }, select: { id: true, faixaRisco: true }, orderBy: { createdAt: 'asc' } });
    const reguaPadraoId = usar ? tenant.reguaPadraoId : selecionarRegua(regras.map((r) => ({ ...r, ativo: true })), false, null, tenant.reguaPadraoId)?.id ?? null;
    try {
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { usarFaixaRisco: usar, reguaPadraoId } });
      return { usarFaixaRisco: usar, reguaPadraoId };
    } catch (e) {
      // A troca de modo não pode falhar por causa da régua-padrão (no modo simples
      // ela é recalculada de forma determinística). Se a escrita do FK falhar,
      // tenta de novo zerando a régua — o modo ainda muda e a UI segue funcionando.
      this.logger.error(`setUsarFaixaRisco(${usar}) falhou ao gravar reguaPadraoId=${reguaPadraoId}: ${this.detalheErro(e)}`);
      try {
        await this.prisma.tenant.update({ where: { id: tenantId }, data: { usarFaixaRisco: usar, reguaPadraoId: null } });
        return { usarFaixaRisco: usar, reguaPadraoId: null };
      } catch (e2) {
        this.logger.error(`setUsarFaixaRisco(${usar}) falhou também sem reguaPadraoId: ${this.detalheErro(e2)}`);
        throw new BadRequestException(`Não foi possível alterar o modo da cobrança. Detalhe: ${this.detalheErro(e2)}`);
      }
    }
  }

  async setReguaPadrao(tenantId: string, ruleId: string) {
    const rule = await this.prisma.dunningRule.findFirst({ where: { id: ruleId, tenantId, ativo: true }, select: { id: true } });
    if (!rule) throw new BadRequestException('Selecione uma régua ativa deste ambiente.');
    try {
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { reguaPadraoId: rule.id } });
      return { reguaPadraoId: rule.id };
    } catch (e) {
      this.logger.error(`setReguaPadrao(${ruleId}) falhou: ${this.detalheErro(e)}`);
      throw new BadRequestException(`Não foi possível definir a régua principal. Detalhe: ${this.detalheErro(e)}`);
    }
  }

  async get(tenantId: string, id: string) {
    const rule = await this.prisma.dunningRule.findFirst({
      where: { id, tenantId },
      include: { steps: { orderBy: { ordem: 'asc' } } },
    });
    if (!rule) throw new NotFoundException('Regua nao encontrada');
    return rule;
  }

  /**
   * Botão de URL apontando para a URL do ERP: a Meta recusaria no envio (só aceita o
   * sufixo do domínio fixo do template). Barra ao salvar, enquanto dá para corrigir.
   */
  private validarBotoes(dto: SaveRuleDto) {
    for (const s of dto.steps ?? []) {
      const erro = erroMapeamentoBotoes(s.templateBotoes);
      if (erro) throw new BadRequestException(`Passo ${s.ordem}: ${erro}`);
    }
  }

  create(tenantId: string, dto: SaveRuleDto) {
    this.validarBotoes(dto);
    return this.prisma.dunningRule.create({
      data: {
        tenantId,
        nome: dto.nome,
        nicho: dto.nicho,
        faixaRisco: dto.faixaRisco ?? null,
        apenasNotificar: dto.apenasNotificar ?? false,
        janelaInicio: dto.janelaInicio ?? 9,
        janelaFim: dto.janelaFim ?? 20,
        diasUteisSomente: dto.diasUteisSomente ?? false,
        maxMsgsDia: dto.maxMsgsDia ?? null,
        roteamentoPorCusto: dto.roteamentoPorCusto ?? false,
        ativo: dto.ativo ?? true,
        steps: {
          create: dto.steps.map((s) => ({
            ordem: s.ordem,
            offsetDias: s.offsetDias,
            canal: s.canal,
            channelAccountId: s.channelAccountId ?? null,
            canaisFallback: s.canaisFallback ?? [],
            template: s.template,
            emailAssunto: s.emailAssunto?.trim() || null,
            templateB: s.templateB ?? null,
            templateName: s.templateName ?? null,
            templateParams: s.templateParams ?? [],
            templateBotoes: s.templateBotoes ? (s.templateBotoes as unknown as object) : undefined,
            abTest: s.abTest ?? false,
            ativo: s.ativo ?? true,
          })),
        },
      },
      include: { steps: { orderBy: { ordem: 'asc' } } },
    });
  }

  async update(tenantId: string, id: string, dto: SaveRuleDto) {
    this.validarBotoes(dto);
    await this.get(tenantId, id);
    await this.prisma.dunningStep.deleteMany({ where: { ruleId: id } });
    return this.prisma.dunningRule.update({
      where: { id },
      data: {
        nome: dto.nome,
        nicho: dto.nicho,
        faixaRisco: dto.faixaRisco ?? null,
        apenasNotificar: dto.apenasNotificar ?? false,
        janelaInicio: dto.janelaInicio ?? 9,
        janelaFim: dto.janelaFim ?? 20,
        diasUteisSomente: dto.diasUteisSomente ?? false,
        maxMsgsDia: dto.maxMsgsDia ?? null,
        roteamentoPorCusto: dto.roteamentoPorCusto ?? false,
        ativo: dto.ativo ?? true,
        steps: {
          create: dto.steps.map((s) => ({
            ordem: s.ordem,
            offsetDias: s.offsetDias,
            canal: s.canal,
            channelAccountId: s.channelAccountId ?? null,
            canaisFallback: s.canaisFallback ?? [],
            template: s.template,
            emailAssunto: s.emailAssunto?.trim() || null,
            templateB: s.templateB ?? null,
            templateName: s.templateName ?? null,
            templateParams: s.templateParams ?? [],
            templateBotoes: s.templateBotoes ? (s.templateBotoes as unknown as object) : undefined,
            abTest: s.abTest ?? false,
            ativo: s.ativo ?? true,
          })),
        },
      },
      include: { steps: { orderBy: { ordem: 'asc' } } },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.dunningRule.delete({ where: { id } });
    return { ok: true };
  }

  listNichoTemplates() {
    return NICHO_TEMPLATES.map((t) => ({ id: t.id, nicho: t.nicho, nome: t.nome, faixaRisco: t.faixaRisco, passos: t.steps.length }));
  }

  async cloneNicho(tenantId: string, templateId: string) {
    const tpl = findNicho(templateId);
    if (!tpl) throw new BadRequestException('Modelo nao encontrado');
    return this.prisma.dunningRule.create({
      data: {
        tenantId,
        nome: tpl.nome,
        nicho: tpl.nicho,
        faixaRisco: tpl.faixaRisco,
        steps: { create: tpl.steps.map((s) => ({ ordem: s.ordem, offsetDias: s.offsetDias, canal: s.canal, template: s.template })) },
      },
      include: { steps: { orderBy: { ordem: 'asc' } } },
    });
  }

  async abStats(tenantId: string) {
    const dispatches = await this.prisma.messageDispatch.findMany({
      where: { tenantId, variante: { not: null }, status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] } },
      include: { invoice: { select: { status: true } } },
    });

    const acc: Record<Variante, { enviados: number; pagos: number }> = { A: { enviados: 0, pagos: 0 }, B: { enviados: 0, pagos: 0 } };
    for (const d of dispatches) {
      const v = (d.variante as Variante) ?? 'A';
      if (v !== 'A' && v !== 'B') continue;
      acc[v].enviados++;
      if (d.invoice?.status === 'PAGA') acc[v].pagos++;
    }
    return evaluateAb([
      { variante: 'A', ...acc.A },
      { variante: 'B', ...acc.B },
    ]);
  }
}
