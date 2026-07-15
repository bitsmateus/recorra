import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelType, Prisma, RiskBand } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { DispatchService } from '@/modules/dunning/dispatch.service';
import { PaymentProviderFactory } from '@/modules/payments/payment-provider.factory';
import { DispatchQueue } from '@/queue/dispatch-queue';

export interface CampaignInput {
  nome: string;
  tipoEnvio: 'REGUA' | 'MENSAGEM' | 'LEMBRETE';
  ruleId?: string | null;
  mensagem?: string | null;
  canal?: ChannelType | null;
  channelAccountId?: string | null;
  templateNome?: string | null;
  templateParams?: string[];
  escopoFatura?: 'TODAS' | 'PROXIMA';
  filtroTodos?: boolean;
  filtroEtiqueta?: string | null;
  filtroValorMin?: number | null;
  filtroValorMax?: number | null;
  filtroFaixa?: RiskBand | null;
  delaySegundos?: number;
  incluirIds?: string[];
  excluirIds?: string[];
  publicoDinamico?: boolean;
  agendamento?: 'UMA_VEZ' | 'MENSAL' | 'SEMPRE_ATIVA';
  diaDoMes?: number | null;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: DispatchService,
    private readonly factory: PaymentProviderFactory,
    private readonly dispatchQueue: DispatchQueue,
  ) {}

  /** Conta entregues/fila/falha de uma run a partir do status ATUAL dos disparos. */
  private async resumoEntrega(runId: string) {
    const recipients = await this.prisma.campaignRecipient.findMany({ where: { runId }, select: { status: true, dispatchId: true } });
    const ids = recipients.map((r) => r.dispatchId).filter(Boolean) as string[];
    const dispatches = ids.length ? await this.prisma.messageDispatch.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } }) : [];
    const dmap = new Map(dispatches.map((d) => [d.id, d.status]));
    let enviados = 0, fila = 0, falha = 0;
    for (const r of recipients) {
      const st = (r.dispatchId ? dmap.get(r.dispatchId) : undefined) ?? r.status;
      if (st === 'ENVIADO' || st === 'ENTREGUE' || st === 'LIDO') enviados++;
      else if (st === 'FALHA' || st === 'IGNORADO') falha++;
      else fila++;
    }
    return { total: recipients.length, enviados, fila, falha };
  }

  async list(tenantId: string, filtros: { q?: string; status?: string; tipoEnvio?: string; ruleId?: string; agendamento?: string; de?: string; ate?: string; etiqueta?: string; canal?: string } = {}) {
    const where: any = { tenantId };
    if (filtros.q) where.nome = { contains: filtros.q.trim(), mode: 'insensitive' };
    if (filtros.status) where.status = filtros.status;
    if (filtros.tipoEnvio) where.tipoEnvio = filtros.tipoEnvio;
    if (filtros.ruleId) where.ruleId = filtros.ruleId;
    if (filtros.agendamento) where.agendamento = filtros.agendamento;
    if (filtros.etiqueta) where.filtroEtiqueta = filtros.etiqueta.toLowerCase();
    if (filtros.canal) where.canal = filtros.canal;
    if (filtros.de || filtros.ate) {
      where.createdAt = {
        ...(filtros.de ? { gte: new Date(filtros.de) } : {}),
        ...(filtros.ate ? { lte: new Date(filtros.ate + 'T23:59:59') } : {}),
      };
    }
    const campanhas = await this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        rule: { select: { id: true, nome: true } },
        runs: { orderBy: { executadoEm: 'desc' }, take: 1 },
      },
    });
    return Promise.all(campanhas.map(async (c) => ({
      ...c,
      entrega: c.runs[0] ? await this.resumoEntrega(c.runs[0].id) : null,
    })));
  }

  async get(tenantId: string, id: string) {
    const c = await this.prisma.campaign.findFirst({
      where: { id, tenantId },
      include: { rule: { select: { id: true, nome: true } }, runs: { orderBy: { executadoEm: 'desc' } } },
    });
    if (!c) throw new NotFoundException('Campanha não encontrada');
    return c;
  }

  private dados(input: CampaignInput) {
    return {
      nome: input.nome?.trim(),
      tipoEnvio: input.tipoEnvio,
      ruleId: input.tipoEnvio === 'REGUA' ? input.ruleId || null : null,
      mensagem: (input.tipoEnvio === 'MENSAGEM' || input.tipoEnvio === 'LEMBRETE') ? input.mensagem || null : null,
      canal: input.canal || null,
      channelAccountId: input.channelAccountId || null,
      // Template WABA só faz sentido em Mensagem única com canal oficial.
      templateNome: input.tipoEnvio === 'MENSAGEM' ? input.templateNome || null : null,
      templateParams: input.tipoEnvio === 'MENSAGEM' && input.templateNome ? (input.templateParams ?? []) : [],
      escopoFatura: input.escopoFatura || 'TODAS',
      delaySegundos: input.delaySegundos != null ? Math.max(0, Math.min(600, Math.floor(input.delaySegundos))) : 5,
      filtroTodos: !!input.filtroTodos,
      filtroEtiqueta: input.filtroEtiqueta || null,
      filtroValorMin: input.filtroValorMin ?? null,
      filtroValorMax: input.filtroValorMax ?? null,
      filtroFaixa: input.filtroFaixa || null,
      incluirIds: input.incluirIds ?? [],
      excluirIds: input.excluirIds ?? [],
      publicoDinamico: input.publicoDinamico ?? true,
      agendamento: input.agendamento || 'UMA_VEZ',
      diaDoMes: input.diaDoMes ?? null,
    };
  }

  async create(tenantId: string, input: CampaignInput) {
    if (!input.nome?.trim()) throw new BadRequestException('Nome é obrigatório');
    if (input.tipoEnvio === 'REGUA' && !input.ruleId) throw new BadRequestException('Selecione uma régua');
    // Mensagem única: aceita texto livre OU um template (canal oficial usa template).
    if (input.tipoEnvio === 'MENSAGEM' && !input.mensagem?.trim() && !input.templateNome?.trim()) {
      throw new BadRequestException('Escreva a mensagem ou escolha um template');
    }
    if (input.tipoEnvio === 'LEMBRETE' && !input.mensagem?.trim()) throw new BadRequestException('Escreva a mensagem');
    const proxima = this.calcularProxima(input.agendamento || 'UMA_VEZ', input.diaDoMes ?? null);
    return this.prisma.campaign.create({
      data: { tenantId, ...this.dados(input), proximaExecucao: proxima, status: 'RASCUNHO' },
    });
  }

  async update(tenantId: string, id: string, input: CampaignInput) {
    await this.get(tenantId, id);
    const proxima = this.calcularProxima(input.agendamento || 'UMA_VEZ', input.diaDoMes ?? null);
    return this.prisma.campaign.update({ where: { id }, data: { ...this.dados(input), proximaExecucao: proxima } });
  }

  async duplicar(tenantId: string, id: string) {
    const c = await this.get(tenantId, id);
    return this.prisma.campaign.create({
      data: {
        tenantId,
        nome: `${c.nome} - Cópia`,
        tipoEnvio: c.tipoEnvio,
        ruleId: c.ruleId,
        mensagem: c.mensagem,
        canal: c.canal,
        escopoFatura: c.escopoFatura,
        delaySegundos: c.delaySegundos,
        filtroTodos: c.filtroTodos,
        filtroEtiqueta: c.filtroEtiqueta,
        filtroValorMin: c.filtroValorMin,
        filtroValorMax: c.filtroValorMax,
        filtroFaixa: c.filtroFaixa,
        incluirIds: c.incluirIds,
        excluirIds: c.excluirIds,
        publicoDinamico: c.publicoDinamico,
        agendamento: c.agendamento,
        diaDoMes: c.diaDoMes,
        status: 'RASCUNHO',
        proximaExecucao: this.calcularProxima(c.agendamento, c.diaDoMes),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.campaign.delete({ where: { id } });
    return { ok: true };
  }

  async setStatus(tenantId: string, id: string, status: 'ATIVA' | 'PAUSADA') {
    await this.get(tenantId, id);
    return this.prisma.campaign.update({ where: { id }, data: { status, ativa: status === 'ATIVA' } });
  }

  private calcularProxima(agendamento: string, diaDoMes: number | null): Date | null {
    if (agendamento === 'UMA_VEZ') return null;
    const dia = diaDoMes && diaDoMes >= 1 && diaDoMes <= 28 ? diaDoMes : 1;
    const now = new Date();
    let alvo = new Date(now.getFullYear(), now.getMonth(), dia, 9, 0, 0);
    if (alvo <= now) alvo = new Date(now.getFullYear(), now.getMonth() + 1, dia, 9, 0, 0);
    return alvo;
  }

  /** Resolve o público-alvo da campanha a partir dos filtros. */
  async resolverPublico(tenantId: string, camp: {
    filtroTodos: boolean; filtroEtiqueta: string | null; filtroValorMin: Prisma.Decimal | number | null;
    filtroValorMax: Prisma.Decimal | number | null; filtroFaixa: RiskBand | null;
    delaySegundos?: number;
  incluirIds?: string[]; excluirIds?: string[];
  }) {
    const where: Prisma.CustomerWhereInput = { tenantId, ativo: true };
    if (!camp.filtroTodos) {
      if (camp.filtroEtiqueta) where.tags = { has: camp.filtroEtiqueta.toLowerCase() };
      if (camp.filtroValorMin != null || camp.filtroValorMax != null) {
        where.valorPlano = {
          ...(camp.filtroValorMin != null ? { gte: Number(camp.filtroValorMin) } : {}),
          ...(camp.filtroValorMax != null ? { lte: Number(camp.filtroValorMax) } : {}),
        };
      }
    }
    let customers = await this.prisma.customer.findMany({ where, take: 5000, orderBy: { nome: 'asc' } });
    if (!camp.filtroTodos && camp.filtroFaixa) {
      const ids = customers.map((c) => c.id);
      const scores = await this.prisma.riskScore.findMany({ where: { tenantId, customerId: { in: ids } }, orderBy: { calculadoEm: 'desc' } });
      const faixaBy = new Map<string, RiskBand>();
      for (const s of scores) if (!faixaBy.has(s.customerId)) faixaBy.set(s.customerId, s.faixa);
      customers = customers.filter((c) => faixaBy.get(c.id) === camp.filtroFaixa);
    }
    // Remove os excluídos manualmente e adiciona os incluídos manualmente.
    const excl = new Set(camp.excluirIds ?? []);
    customers = customers.filter((c) => !excl.has(c.id));
    const jaTem = new Set(customers.map((c) => c.id));
    const faltantes = (camp.incluirIds ?? []).filter((id) => !jaTem.has(id) && !excl.has(id));
    if (faltantes.length) {
      const extras = await this.prisma.customer.findMany({ where: { tenantId, id: { in: faltantes } } });
      customers = [...customers, ...extras];
    }
    return customers;
  }

  /** Prévia de público a partir de filtros avulsos (sem salvar campanha). */
  async previaPublico(tenantId: string, f: { filtroTodos?: boolean; filtroEtiqueta?: string | null; filtroValorMin?: number | null; filtroValorMax?: number | null; filtroFaixa?: RiskBand | null; incluirIds?: string[]; excluirIds?: string[] }) {
    const pub = await this.resolverPublico(tenantId, {
      filtroTodos: !!f.filtroTodos, filtroEtiqueta: f.filtroEtiqueta || null,
      filtroValorMin: f.filtroValorMin ?? null, filtroValorMax: f.filtroValorMax ?? null, filtroFaixa: f.filtroFaixa || null,
      incluirIds: f.incluirIds ?? [], excluirIds: f.excluirIds ?? [],
    });
    return { total: pub.length, contatos: pub.slice(0, 2000).map((c) => ({ id: c.id, nome: c.nome, doc: c.doc })) };
  }

  async previewPublico(tenantId: string, id: string) {
    const camp = await this.get(tenantId, id);
    const pub = await this.resolverPublico(tenantId, camp);
    return { total: pub.length, amostra: pub.slice(0, 10).map((c) => ({ nome: c.nome, doc: c.doc })) };
  }

  /** Busca o Pix copia-e-cola no gateway se a fatura ainda não tiver (ex.: importada). */
  private async garantirPix<T extends { id: string; pixCopiaCola?: string | null; externalId?: string | null; providerAccountId?: string | null }>(inv: T | null): Promise<T | null> {
    if (!inv || inv.pixCopiaCola || !inv.externalId || !inv.providerAccountId) return inv;
    try {
      const provider = await this.factory.forAccount(inv.providerAccountId);
      const pix = provider.getPixCopiaCola ? await provider.getPixCopiaCola(inv.externalId) : null;
      if (pix) {
        await this.prisma.invoice.update({ where: { id: inv.id }, data: { pixCopiaCola: pix } });
        return { ...inv, pixCopiaCola: pix };
      }
    } catch { /* mantém sem pix */ }
    return inv;
  }

  private render(txt: string | null | undefined, c: { nome: string; doc?: string | null }, inv?: { valor: any; vencimento: Date; pixCopiaCola?: string | null; boletoUrl?: string | null; boletoLinha?: string | null; linkPagamento?: string | null } | null): string {
    const valor = inv ? Number(inv.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
    const venc = inv ? new Date(inv.vencimento).toLocaleDateString('pt-BR') : '';
    return (txt || '')
      .replace(/\{\{\s*nome\s*\}\}/gi, c.nome)
      .replace(/\{\{\s*documento\s*\}\}/gi, c.doc || '')
      .replace(/\{\{\s*valor\s*\}\}/gi, valor)
      .replace(/\{\{\s*vencimento\s*\}\}/gi, venc)
      .replace(/\{\{\s*pix\s*\}\}/gi, inv?.pixCopiaCola || '')
      .replace(/\{\{\s*boleto\s*\}\}/gi, inv?.boletoUrl || inv?.boletoLinha || '')
      .replace(/\{\{\s*(link|linkpagamento|pagamento)\s*\}\}/gi, inv?.linkPagamento || '');
  }

  private temVariavelFatura(txt?: string | null): boolean {
    return /\{\{\s*(valor|vencimento|pix|boleto|link|linkpagamento|pagamento)\s*\}\}/i.test(txt || '');
  }

  /** Executa a campanha: cria a run, os destinatários e os disparos. */
  async executar(tenantId: string, id: string) {
    const camp = await this.prisma.campaign.findFirst({ where: { id, tenantId }, include: { rule: { include: { steps: { where: { ativo: true }, orderBy: { ordem: 'asc' } } } } } });
    if (!camp) throw new NotFoundException('Campanha não encontrada');
    const publico = await this.resolverPublico(tenantId, camp);

    const run = await this.prisma.campaignRun.create({ data: { campaignId: camp.id, tenantId, totalContatos: publico.length } });
    let enviados = 0;
    let falhas = 0;
    const imediatos: string[] = [];

    let ignorados = 0;
    const canalCampanha = camp.canal ?? 'WHATSAPP_EVOLUTION';
    for (const cliente of publico) {
      try {
        // Respeita opt-out (LGPD): não envia para quem revogou o consentimento no canal.
        if (await this.optOut(cliente.id, canalCampanha)) { ignorados++; continue; }
        if (camp.tipoEnvio === 'LEMBRETE') {
          // Puxa as faturas em aberto do cliente e injeta o Pix/boleto/link de cada uma.
          const abertas = await this.prisma.invoice.findMany({
            where: { tenantId, customerId: cliente.id, status: { in: ['PENDENTE', 'VENCIDA'] } },
            orderBy: { vencimento: 'asc' },
          });
          const alvo = camp.escopoFatura === 'PROXIMA' ? abertas.slice(0, 1) : abertas;
          if (alvo.length === 0) { ignorados++; continue; }
          const precisaPix = /\{\{\s*pix\s*\}\}/i.test(camp.mensagem || '');
          for (let inv of alvo) {
            if (precisaPix) inv = (await this.garantirPix(inv)) ?? inv;
            const d = await this.prisma.messageDispatch.create({
              data: {
                tenantId, customerId: cliente.id, invoiceId: inv.id, campaignId: camp.id,
                canal: camp.canal ?? 'WHATSAPP_EVOLUTION',
                conteudo: this.render(camp.mensagem, cliente, inv),
                status: 'FILA', agendadoPara: new Date(),
              },
            });
            imediatos.push(d.id);
            await this.prisma.campaignRecipient.create({
              data: { runId: run.id, tenantId, customerId: cliente.id, nome: cliente.nome, doc: cliente.doc, canal: camp.canal ?? null, dispatchId: d.id, status: 'FILA' },
            });
          }
          enviados++;
          continue;
        }

        let primeiroDispatchId: string | undefined;
        if (camp.tipoEnvio === 'MENSAGEM') {
          // Num template, as variáveis (valor/vencimento/link) estão em templateParams,
          // não em `mensagem`. Consideramos ambos ao decidir se puxa a fatura do cliente.
          const textoVars = camp.templateNome ? (camp.templateParams ?? []).join(' ') : (camp.mensagem ?? '');
          let inv = this.temVariavelFatura(textoVars)
            ? await this.prisma.invoice.findFirst({ where: { tenantId, customerId: cliente.id, status: { in: ['PENDENTE', 'VENCIDA'] } }, orderBy: { vencimento: 'asc' } })
            : null;
          if (inv && /\{\{\s*pix\s*\}\}/i.test(textoVars)) inv = await this.garantirPix(inv);
          // Canal oficial (WABA): envia template com as variáveis mapeadas por cliente.
          const usaTemplate = !!camp.templateNome;
          const templateParams = usaTemplate
            ? (camp.templateParams ?? []).map((tok) => this.render(tok, cliente, inv))
            : [];
          const d = await this.prisma.messageDispatch.create({
            data: {
              tenantId, customerId: cliente.id, invoiceId: inv?.id, campaignId: camp.id,
              canal: camp.canal ?? 'WHATSAPP_EVOLUTION',
              channelAccountId: camp.channelAccountId ?? undefined,
              templateName: usaTemplate ? camp.templateNome : undefined,
              templateParams,
              conteudo: usaTemplate
                ? `[template: ${camp.templateNome}] ${templateParams.join(' | ')}`
                : this.render(camp.mensagem, cliente, inv),
              status: 'FILA', agendadoPara: new Date(),
            },
          });
          primeiroDispatchId = d.id;
          imediatos.push(d.id);
        } else if (camp.rule) {
          const now = Date.now();
          for (const step of camp.rule.steps) {
            const d = await this.prisma.messageDispatch.create({
              data: {
                tenantId, customerId: cliente.id, campaignId: camp.id,
                canal: step.canal, channelAccountId: step.channelAccountId ?? undefined, cadeiaCanais: step.canaisFallback,
                template: step.template, conteudo: this.render(step.template, cliente),
                status: 'FILA', agendadoPara: new Date(now + step.offsetDias * 86400000),
              },
            });
            if (!primeiroDispatchId) primeiroDispatchId = d.id;
            if (step.offsetDias <= 0) imediatos.push(d.id);
          }
        }
        await this.prisma.campaignRecipient.create({
          data: { runId: run.id, tenantId, customerId: cliente.id, nome: cliente.nome, doc: cliente.doc, canal: camp.canal ?? null, dispatchId: primeiroDispatchId, status: 'FILA' },
        });
        enviados++;
      } catch (e) {
        falhas++;
        await this.prisma.campaignRecipient.create({
          data: { runId: run.id, tenantId, customerId: cliente.id, nome: cliente.nome, doc: cliente.doc, status: 'FALHA', erro: String(e).slice(0, 300) },
        }).catch(() => undefined);
      }
    }
    void ignorados;

    // Dispara em segundo plano, respeitando o intervalo entre mensagens (anti-banimento).
    // Não bloqueia a resposta; o relatório atualiza conforme os envios acontecem.
    void this.enviarComDelay(imediatos, camp.delaySegundos ?? 5);

    const novoStatus = camp.agendamento === 'UMA_VEZ' ? 'CONCLUIDA' : 'ATIVA';
    const proxima = camp.agendamento === 'UMA_VEZ' ? null : this.calcularProxima(camp.agendamento, camp.diaDoMes);
    await this.prisma.campaign.update({ where: { id: camp.id }, data: { status: novoStatus, proximaExecucao: proxima } });
    await this.prisma.campaignRun.update({ where: { id: run.id }, data: { enviados, falhas } });

    return { runId: run.id, total: publico.length, enviados, falhas };
  }

  /** Opt-out (LGPD): true se o cliente revogou o consentimento para o canal. */
  private async optOut(customerId: string, canal: ChannelType): Promise<boolean> {
    const revogado = await this.prisma.consent.findFirst({ where: { customerId, canal, status: 'REVOGADO' } });
    return !!revogado;
  }

  /** Relatório: destinatários da última run (ou de uma run específica), com status atual do disparo. */
  async relatorio(tenantId: string, id: string, runId?: string) {
    const camp = await this.get(tenantId, id);
    const run = runId
      ? await this.prisma.campaignRun.findFirst({ where: { id: runId, campaignId: id, tenantId } })
      : await this.prisma.campaignRun.findFirst({ where: { campaignId: id, tenantId }, orderBy: { executadoEm: 'desc' } });
    if (!run) return { campanha: camp.nome, run: null, destinatarios: [] };

    const recipients = await this.prisma.campaignRecipient.findMany({ where: { runId: run.id }, orderBy: { nome: 'asc' } });
    const dispatchIds = recipients.map((r) => r.dispatchId).filter(Boolean) as string[];
    const dispatches = dispatchIds.length ? await this.prisma.messageDispatch.findMany({ where: { id: { in: dispatchIds } } }) : [];
    const dmap = new Map(dispatches.map((d) => [d.id, d]));
    const destinatarios = recipients.map((r) => {
      const d = r.dispatchId ? dmap.get(r.dispatchId) : undefined;
      return { nome: r.nome, doc: r.doc, canal: r.canal, status: d?.status ?? r.status, enviadoEm: d?.enviadoEm ?? r.enviadoEm, erro: d?.erro ?? r.erro };
    });
    const resumo = await this.resumoEntrega(run.id);
    return { campanha: camp.nome, run, resumo, destinatarios };
  }

  /**
   * Enfileira os disparos no BullMQ, com atraso escalonado para respeitar o intervalo
   * entre mensagens. Usar a fila (jobId = id do disparo) evita duplicação: o worker é o
   * único processador e o agendador (cron) não cria job repetido para o mesmo disparo.
   */
  private async enviarComDelay(ids: string[], delaySeg: number) {
    for (let i = 0; i < ids.length; i++) {
      try { await this.dispatchQueue.enqueue(ids[i], i * (delaySeg > 0 ? delaySeg : 0) * 1000); } catch { /* erro já registrado no disparo */ }
    }
  }

  /** Executa campanhas recorrentes vencidas (chamado pelo agendador). */
  async executarAgendadas() {
    const agora = new Date();
    const vencidas = await this.prisma.campaign.findMany({
      where: { ativa: true, agendamento: { in: ['MENSAL', 'SEMPRE_ATIVA'] }, proximaExecucao: { lte: agora }, status: { not: 'PAUSADA' } },
    });
    const resultados = [];
    for (const c of vencidas) {
      const r = await this.executar(c.tenantId, c.id).catch((e) => ({ erro: String(e) }));
      resultados.push({ campanha: c.nome, ...r });
    }
    return { executadas: resultados.length, resultados };
  }
}
