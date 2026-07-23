import { ForbiddenException, Injectable, NotFoundException , BadRequestException } from '@nestjs/common';
import { ChargeMethod, InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/common/audit/audit.service';
import { PaymentProviderFactory } from './payment-provider.factory';
import { SplitRuleInput } from './payment-provider.interface';
import { computeSplit } from './split';
import { canTransition } from './invoice-status';
import { featureEnabled, PlanTier, Feature } from '@/modules/platform/plans';
import { onlyDigits } from "@/common/util/normalize";
import { parseDateOrThrow, parseDateFilter, parseNumberFilter } from '@/common/util/parse';
import * as XLSX from 'xlsx';

export interface InvoiceFiltros {
  status?: string;
  customerId?: string;
  q?: string;
  metodo?: string;
  origem?: string;
  geracao?: 'gerada' | 'pendente';
  de?: string;
  ate?: string;
  valorMin?: string;
  valorMax?: string;
  etiqueta?: string;
  page?: string | number;
  pageSize?: string | number;
  sortCampo?: string;
  sortDir?: string;
}

@Injectable()
export class ChargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: PaymentProviderFactory,
    private readonly audit: AuditService,
  ) {}

  async gerarCobranca(
    tenantId: string,
    invoiceId: string,
    accountId: string,
    metodo: ChargeMethod = 'PIX',
    splits?: SplitRuleInput[],
    origem = 'avulsa',
    actorId?: string,
  ) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const flags = (tenant.featureFlags as Partial<Record<Feature, boolean>>) ?? undefined;
    if (!featureEnabled(tenant.plano as PlanTier, 'cobranca', flags)) {
      throw new ForbiddenException('Seu plano nao inclui geracao de cobranca. Faca upgrade para o Essencial ou superior.');
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { customer: true },
    });
    if (!invoice) throw new NotFoundException('Fatura nao encontrada');

    // Valida posse da conta de gateway pelo tenant (impede usar credenciais de outro tenant — IDOR).
    const account = await this.prisma.paymentProviderAccount.findFirst({ where: { id: accountId, tenantId } });
    if (!account) throw new NotFoundException('Conta de gateway nao encontrada');

    const provider = await this.factory.forAccount(accountId, tenantId);
    const result = await provider.createCharge({
      customer: {
        nome: invoice.customer.nome,
        doc: invoice.customer.doc,
        email: invoice.customer.email ?? undefined,
        telefone: invoice.customer.telefone ?? undefined,
      },
      valor: Number(invoice.valor),
      vencimento: invoice.vencimento,
      metodo,
      descricao: invoice.descricao ?? undefined,
      externalRef: invoice.id,
      splits,
    });

    const splitCalc = splits?.length ? computeSplit(Number(invoice.valor), splits) : undefined;

    const upd = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        providerAccountId: accountId,
        provider: account.provider,
        externalId: result.externalId,
        metodo,
        pixCopiaCola: result.pixCopiaCola,
        boletoLinha: result.boletoLinha,
        boletoUrl: result.boletoUrl,
        linkPagamento: result.linkPagamento,
        splitConfig: splitCalc ? (splitCalc as unknown as object) : undefined,
        origem,
      },
    });
    await this.audit.record({
      tenantId, userId: actorId, acao: 'invoice.charge.generate', entidade: 'Invoice', entidadeId: invoice.id,
      depois: { provider: account.provider, accountId, metodo, valor: Number(invoice.valor), externalId: result.externalId, origem },
    });
    return upd;
  }

  /** Cria uma fatura avulsa para o cliente e, se accountId for informado, ja gera o Pix. */
  async criarFatura(
    tenantId: string,
    input: { customerId: string; valor: number; vencimento: string | Date; descricao?: string; accountId?: string; metodo?: ChargeMethod },
  ) {
    const customer = await this.prisma.customer.findFirst({ where: { id: input.customerId, tenantId } });
    if (!customer) throw new NotFoundException("Cliente nao encontrado");
    const valor = Number(input.valor);
    if (!(valor > 0)) throw new BadRequestException("Valor invalido");
    const vencimento = new Date(input.vencimento);
    if (isNaN(vencimento.getTime())) throw new BadRequestException("Vencimento invalido");

    const fatura = await this.prisma.invoice.create({
      data: {
        tenantId,
        customerId: customer.id,
        valor,
        vencimento,
        descricao: input.descricao || null,
        status: vencimento < new Date() ? "VENCIDA" : "PENDENTE",
        origem: "avulsa",
      },
    });

    if (input.accountId) {
      return this.gerarCobranca(tenantId, fatura.id, input.accountId, input.metodo ?? "PIX");
    }
    return fatura;
  }

  async gerarLote(
    tenantId: string,
    accountId: string,
    metodo: ChargeMethod = 'PIX',
    invoiceIds?: string[],
    splits?: SplitRuleInput[],
  ) {
    const where = invoiceIds?.length
      ? { tenantId, id: { in: invoiceIds } }
      : { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] as InvoiceStatus[] }, gestaoCobranca: 'ATIVA' as const, externalId: null };

    const faturas = await this.prisma.invoice.findMany({ where, select: { id: true }, take: 500 });

    let ok = 0;
    const erros: string[] = [];
    for (const f of faturas) {
      try {
        await this.gerarCobranca(tenantId, f.id, accountId, metodo, splits, 'lote');
        ok++;
      } catch (e) {
        erros.push(`${f.id}: ${String(e)}`);
      }
    }
    return { total: faturas.length, geradas: ok, erros };
  }

  async setContestada(tenantId: string, invoiceId: string, contestada: boolean) {
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!inv) throw new NotFoundException('Fatura nao encontrada');
    return this.prisma.invoice.update({ where: { id: invoiceId }, data: { contestada } });
  }

  /**
   * Importa clientes e cobranças existentes de um gateway (ex.: Asaas) para o Recorrai.
   *
   * Por padrão traz só cobranças **a receber** (PENDENTE/VENCIDA) — cobranças já pagas
   * (e canceladas/estornadas) NÃO entram na sincronização geral. Para trazer as pagas de
   * um cliente específico, use `{ somentePagas: true, customerId }` (ação na tela do cliente).
   */
  async importarDoGateway(
    tenantId: string,
    accountId: string,
    opts: { somentePagas?: boolean; incluirPagas?: boolean; customerId?: string; lookbackDays?: number | null } = {},
  ) {
    const { somentePagas = false, incluirPagas = false, customerId: escopoCustomerId } = opts;
    const account = await this.prisma.paymentProviderAccount.findFirst({ where: { id: accountId, tenantId } });
    if (!account) throw new NotFoundException("Conta de gateway nao encontrada");
    const provider = await this.factory.forAccount(accountId);
    if (!provider.supportsImport?.() || !provider.listCustomers || !provider.listPayments) {
      throw new BadRequestException("Este gateway ainda nao suporta importacao");
    }
    const lookbackDays = this.normalizarLookback(opts.lookbackDays !== undefined ? opts.lookbackDays : account.importLookbackDays);
    if (opts.lookbackDays !== undefined && !somentePagas && !escopoCustomerId) {
      await this.prisma.paymentProviderAccount.update({ where: { id: account.id }, data: { importLookbackDays: lookbackDays } });
    }

    // Filtro de status: só pagas / todas / apenas a receber (padrão).
    const statusPermitido = (s: string) => {
      if (somentePagas) return s === "PAGA";
      if (incluirPagas) return true;
      return s === "PENDENTE" || s === "VENCIDA";
    };

    const result = { clientes: 0, clientesAtualizados: 0, faturas: 0, faturasAtualizadas: 0, ativas: 0, legado: 0, ignorados: 0 };
    const extToCustomerId = new Map<string, string>();

    try {
      if (escopoCustomerId) {
        // Escopo em um único cliente (ex.: sincronizar as pagas dele): não reimporta a base toda.
        const cust = await this.prisma.customer.findFirst({ where: { id: escopoCustomerId, tenantId } });
        if (!cust) throw new NotFoundException("Cliente nao encontrado");
        if (!cust.externalId) throw new BadRequestException("Este cliente nao tem vinculo com o gateway. Importe pelo gateway primeiro.");
        extToCustomerId.set(cust.externalId, cust.id);
      } else {
        const clientes = await provider.listCustomers();
        for (const c of clientes) {
          const doc = onlyDigits(c.doc);
          if (!doc) { result.ignorados++; continue; }
          const existing = await this.prisma.customer.findUnique({ where: { tenantId_doc: { tenantId, doc } } });
          const data = {
            nome: c.nome?.trim() || doc,
            email: c.email?.trim() || null,
            telefone: c.telefone || null,
            cidade: c.cidade != null ? String(c.cidade) : null,
            uf: c.uf != null ? String(c.uf).toUpperCase().slice(0, 2) : null,
            externalId: c.externalId,
          };
          if (existing) {
            const upd = await this.prisma.customer.update({ where: { id: existing.id }, data });
            extToCustomerId.set(c.externalId, upd.id);
            result.clientesAtualizados++;
          } else {
            const created = await this.prisma.customer.create({ data: { tenantId, doc, ...data } });
            extToCustomerId.set(c.externalId, created.id);
            result.clientes++;
          }
        }
      }

    // Meia-noite UTC de hoje (igual ao vencimento gravado), para não rebaixar
    // uma fatura já vencida a PENDENTE só porque o gateway ainda a reporta assim.
    const nAgora = new Date();
    const hojeUtc = new Date(Date.UTC(nAgora.getUTCFullYear(), nAgora.getUTCMonth(), nAgora.getUTCDate()));

    const pagamentos = await provider.listPayments();
    for (const p of pagamentos) {
      const customerId = extToCustomerId.get(p.customerExternalId);
      // Sem cliente correspondente (só conta como ignorado na sync geral, não na escopada).
      if (!customerId) { if (!escopoCustomerId) result.ignorados++; continue; }
      // Pula pelo status (ex.: pagas na sync geral).
      if (!statusPermitido(String(p.status))) continue;
      // Vencida pela data manda sobre o "pendente" do gateway.
      const status = String(p.status) === 'PENDENTE' && p.vencimento && new Date(p.vencimento) < hojeUtc ? 'VENCIDA' : p.status;
      const existing = await this.prisma.invoice.findFirst({ where: { tenantId, provider: account.provider, externalId: p.externalId } });
      const data = {
        valor: p.valor,
        vencimento: p.vencimento,
        status: status as any,
        gestaoCobranca: somentePagas || status === 'PAGA' || this.dentroDaJanela(p.vencimento, lookbackDays) ? 'ATIVA' as const : 'LEGADO' as const,
        metodo: p.metodo,
        descricao: p.descricao || null,
        linkPagamento: p.linkPagamento || null,
        boletoUrl: p.boletoUrl || null,
        pixCopiaCola: p.pixCopiaCola || null,
        pagoEm: p.pagoEm || null,
        provider: account.provider,
        providerAccountId: account.id,
        externalId: p.externalId,
        origem: "import-gateway",
      };
      if (data.gestaoCobranca === 'ATIVA') result.ativas++;
      else result.legado++;
      if (existing) {
        await this.prisma.invoice.update({ where: { id: existing.id }, data });
        result.faturasAtualizadas++;
      } else {
        await this.prisma.invoice.create({ data: { tenantId, customerId, ...data } });
        result.faturas++;
      }
    }
    return result;
    } catch (e: any) {
      const detail = e?.response?.data
        ? JSON.stringify(e.response.data)
        : e?.message || String(e);
      // Detalhe do upstream fica só no log do servidor; o cliente recebe mensagem genérica.
      console.error("[importarDoGateway] falhou:", detail, e?.stack);
      throw new BadRequestException("Falha ao importar do gateway. Verifique as credenciais e tente novamente.");
    }
  }

  async previaImportacaoGateway(tenantId: string, accountId: string, lookbackDays?: number | null) {
    const account = await this.prisma.paymentProviderAccount.findFirst({ where: { id: accountId, tenantId } });
    if (!account) throw new NotFoundException('Conta de gateway nao encontrada');
    const provider = await this.factory.forAccount(accountId, tenantId);
    if (!provider.supportsImport?.() || !provider.listPayments) throw new BadRequestException('Este gateway ainda nao suporta importacao');
    const janela = this.normalizarLookback(lookbackDays !== undefined ? lookbackDays : account.importLookbackDays);
    const pagamentos = await provider.listPayments();
    const abertas = pagamentos.filter((p) => p.status === 'PENDENTE' || p.status === 'VENCIDA');
    const ativas = abertas.filter((p) => this.dentroDaJanela(p.vencimento, janela));
    const legado = abertas.filter((p) => !this.dentroDaJanela(p.vencimento, janela));
    const soma = (rows: typeof abertas) => rows.reduce((total, p) => total + Number(p.valor), 0);
    return {
      lookbackDays: janela,
      total: { quantidade: abertas.length, valor: soma(abertas) },
      ativas: { quantidade: ativas.length, valor: soma(ativas) },
      legado: { quantidade: legado.length, valor: soma(legado) },
    };
  }

  private normalizarLookback(value: number | null | undefined): number | null {
    if (value === null) return null;
    const n = Number(value ?? 30);
    if (!Number.isInteger(n) || n < 0 || n > 3650) throw new BadRequestException('Janela de importacao invalida');
    return n;
  }

  private dentroDaJanela(vencimento: Date, lookbackDays: number | null): boolean {
    if (lookbackDays === null) return true;
    const agora = new Date();
    const limite = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
    limite.setUTCDate(limite.getUTCDate() - lookbackDays);
    return new Date(vencimento) >= limite;
  }

  /**
   * Remove as cobranças PAGAS que vieram da importação de gateway (origem "import-gateway").
   * Não toca em cobranças geradas/manuais nem em pendentes/vencidas. As pagas podem ser
   * trazidas de volta por cliente via "Sincronizar pagas". Os disparos ligados a essas
   * faturas têm o vínculo anulado (invoiceId = null), preservando o histórico de envios.
   */
  async limparPagasImportadas(tenantId: string) {
    const r = await this.prisma.invoice.deleteMany({
      where: { tenantId, origem: "import-gateway", status: "PAGA" },
    });
    return { excluidas: r.count };
  }

  /** Monta o `where` das faturas a partir dos filtros — compartilhado por lista/resumo/export. */
  private buildInvoiceWhere(tenantId: string, filtros: InvoiceFiltros): Prisma.InvoiceWhereInput {
    const where: any = { tenantId };
    if (filtros.status) where.status = filtros.status;
    if (filtros.customerId) where.customerId = filtros.customerId;
    if (filtros.metodo) where.metodo = filtros.metodo;
    if (filtros.origem) where.origem = filtros.origem;
    if (filtros.geracao === 'gerada') where.externalId = { not: null };
    if (filtros.geracao === 'pendente') where.externalId = null;
    if (filtros.q) {
      const q = filtros.q.trim();
      const digitos = q.replace(/\D/g, '');
      // Só busca por doc quando há dígitos: `doc contains ""` casaria com todo
      // mundo e anularia o filtro por nome (ex.: buscar "mateus" trazia tudo).
      const alternativas: Prisma.CustomerWhereInput[] = [{ nome: { contains: q, mode: 'insensitive' } }];
      if (digitos) alternativas.push({ doc: { contains: digitos } });
      where.customer = { OR: alternativas };
    }
    if (filtros.etiqueta) {
      where.customer = { ...(where.customer ?? {}), tags: { has: filtros.etiqueta.toLowerCase() } };
    }
    const de = parseDateFilter(filtros.de);
    const ate = parseDateFilter(filtros.ate ? filtros.ate + 'T23:59:59' : undefined);
    if (de || ate) {
      where.vencimento = { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) };
    }
    const valorMin = parseNumberFilter(filtros.valorMin);
    const valorMax = parseNumberFilter(filtros.valorMax);
    if (valorMin !== undefined || valorMax !== undefined) {
      where.valor = { ...(valorMin !== undefined ? { gte: valorMin } : {}), ...(valorMax !== undefined ? { lte: valorMax } : {}) };
    }
    return where;
  }

  /** Página de faturas (paginação de servidor) + total do filtro. Ordena por valor/vencimento. */
  async listInvoices(tenantId: string, filtros: InvoiceFiltros = {}) {
    const where = this.buildInvoiceWhere(tenantId, filtros);
    const pageSize = Math.min(200, Math.max(1, Math.floor(Number(filtros.pageSize)) || 50));
    const page = Math.max(1, Math.floor(Number(filtros.page)) || 1);
    const campo = filtros.sortCampo === 'valor' ? 'valor' : 'vencimento';
    const dir = filtros.sortDir === 'desc' ? 'desc' : 'asc';
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        // telefone/e-mail entram para marcar na linha quem não tem como ser
        // avisado — a cobrança aparecia normal e nunca saía mensagem nenhuma.
        include: { customer: { select: { nome: true, doc: true, telefone: true, email: true } } },
        // Desempate por id: ordenar só por valor/vencimento (não únicos) não é
        // determinístico entre páginas — o id estabiliza e evita pular/repetir.
        orderBy: [{ [campo]: dir }, { id: dir }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    // `semContato`: sem telefone E sem e-mail = não recebe por canal nenhum.
    const comAviso = items.map((i) => {
      const c = i.customer as { telefone?: string | null; email?: string | null } | null;
      return { ...i, semContato: !c?.telefone?.trim() && !c?.email?.trim() };
    });
    return { items: comAviso, total, page, pageSize };
  }

  /** Resumo agregado sobre a base FILTRADA inteira (não só a página). */
  async resumoInvoices(tenantId: string, filtros: InvoiceFiltros = {}) {
    const where = this.buildInvoiceWhere(tenantId, filtros);
    // Início do dia (UTC), como no resto da plataforma — não o instante atual.
    const n = new Date();
    const limite30 = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - 30));
    const [agg, porStatusRaw, clientes, critico, clientesPorStatusRaw, semContato] = await Promise.all([
      this.prisma.invoice.aggregate({ where, _sum: { valor: true }, _count: true }),
      this.prisma.invoice.groupBy({ by: ['status'], where, _sum: { valor: true }, _count: { _all: true } }),
      this.prisma.invoice.findMany({ where, select: { customerId: true }, distinct: ['customerId'] }),
      this.prisma.invoice.aggregate({ where: { AND: [where, { status: 'VENCIDA', vencimento: { lt: limite30 } }] }, _sum: { valor: true }, _count: true }),
      // Clientes distintos por status (uma linha por par status+cliente).
      this.prisma.invoice.groupBy({ by: ['status', 'customerId'], where }),
      // Em aberto de quem não tem NENHUM contato: essas cobranças nunca geram
      // mensagem, então ficariam paradas sem nenhum aviso na tela.
      this.prisma.invoice.aggregate({
        where: {
          AND: [
            where,
            { status: { in: ['PENDENTE', 'VENCIDA'] } },
            { customer: { AND: [{ OR: [{ telefone: null }, { telefone: '' }] }, { OR: [{ email: null }, { email: '' }] }] } },
          ],
        },
        _sum: { valor: true },
        _count: true,
      }),
    ]);
    const clientesPorStatus: Record<string, number> = {};
    for (const g of clientesPorStatusRaw) clientesPorStatus[g.status] = (clientesPorStatus[g.status] ?? 0) + 1;
    const porStatus: Record<string, { n: number; valor: number; clientes: number }> = {};
    let emAberto = 0;
    for (const g of porStatusRaw) {
      const valor = Number(g._sum.valor ?? 0);
      porStatus[g.status] = { n: g._count._all, valor, clientes: clientesPorStatus[g.status] ?? 0 };
      if (g.status === 'PENDENTE' || g.status === 'VENCIDA') emAberto += valor;
    }
    const total = agg._count;
    const soma = Number(agg._sum.valor ?? 0);
    return {
      total,
      soma,
      emAberto,
      ticketMedio: total ? soma / total : 0,
      clientesDistintos: clientes.length,
      critico: { n: critico._count, valor: Number(critico._sum.valor ?? 0) },
      // Em aberto que hoje NÃO gera cobrança nenhuma (cliente sem telefone e sem e-mail).
      semContato: { n: semContato._count, valor: Number(semContato._sum.valor ?? 0) },
      porStatus,
    };
  }

  /** Exportação da base filtrada inteira (limitada a um teto de segurança). */
  async exportInvoices(tenantId: string, filtros: InvoiceFiltros = {}) {
    const where = this.buildInvoiceWhere(tenantId, filtros);
    const CAP = 20000;
    // Busca CAP+1 para saber se REALMENTE truncou (exatamente CAP não é truncamento).
    const rows = await this.prisma.invoice.findMany({
      where,
      include: { customer: { select: { nome: true, doc: true } } },
      orderBy: [{ vencimento: 'asc' }, { id: 'asc' }],
      take: CAP + 1,
    });
    const truncado = rows.length > CAP;
    return { items: truncado ? rows.slice(0, CAP) : rows, truncado };
  }

  /** Edita campos locais de uma fatura (nao altera a cobranca ja emitida no gateway). */
  async updateInvoice(
    tenantId: string,
    id: string,
    dto: { valor?: number; vencimento?: string; descricao?: string; status?: string },
    actorId?: string,
  ) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!inv) throw new NotFoundException('Fatura nao encontrada');
    const data: any = {};
    if (dto.valor != null) {
      const valor = Number(dto.valor);
      if (!(valor > 0)) throw new BadRequestException('Valor invalido');
      // Não permite alterar o valor depois que a cobrança já foi emitida no gateway
      // (evita divergência Recorrai × gateway).
      if (inv.externalId) throw new BadRequestException('Fatura ja emitida no gateway: valor nao pode ser alterado. Cancele e gere uma nova.');
      data.valor = valor;
    }
    if (dto.vencimento) data.vencimento = parseDateOrThrow(dto.vencimento, 'vencimento');
    if (dto.descricao !== undefined) data.descricao = dto.descricao || null;
    if (dto.status && dto.status !== inv.status) {
      // Valida a transição de estado (bloqueia CANCELADA→PAGA, PAGA→PENDENTE, etc.).
      if (!canTransition(inv.status, dto.status as InvoiceStatus)) {
        throw new BadRequestException(`Transicao de status invalida: ${inv.status} → ${dto.status}`);
      }
      data.status = dto.status;
    }
    const upd = await this.prisma.invoice.update({ where: { id }, data });
    await this.audit.record({
      tenantId, userId: actorId, acao: 'invoice.update', entidade: 'Invoice', entidadeId: id,
      antes: { status: inv.status, valor: Number(inv.valor) },
      depois: { status: upd.status, valor: Number(upd.valor) },
    });
    return upd;
  }

  /** Gera um arquivo .xlsx modelo para importacao de cobrancas. */
  modeloExcel() {
    const header = ['nome', 'cpfCnpj', 'email', 'telefone', 'plano', 'valor', 'vencimento', 'descricao'];
    const exemplos = [
      ['Joao da Silva', '39053344705', 'joao@email.com', '11987654321', 'Plano 300MB', '99,90', '2026-08-10', 'Mensalidade agosto'],
      ['Empresa XYZ LTDA', '11222333000181', 'financeiro@xyz.com', '4832165498', 'Dedicado', '499,00', '2026-08-05', 'Link dedicado'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([header, ...exemplos]);
    ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'cobrancas');
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return {
      filename: 'modelo-cobrancas-recorra.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: buf.toString('base64'),
    };
  }

  /**
   * Remove/cancela uma fatura conforme o escopo:
   *  - 'recorra': apaga so o registro local (mantem a cobranca no gateway).
   *  - 'ambos':   cancela no gateway e apaga o registro local.
   *  - 'gateway': cancela no gateway e mantem o registro local (status CANCELADA).
   */
  async removeInvoice(tenantId: string, id: string, escopo: 'recorra' | 'ambos' | 'gateway' = 'recorra', actorId?: string) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!inv) throw new NotFoundException('Fatura nao encontrada');

    let gatewayMsg: string | undefined;
    const podeCancelarGateway = escopo !== 'recorra';
    if (podeCancelarGateway) {
      if (!inv.externalId || !inv.providerAccountId) {
        if (escopo === 'gateway') throw new BadRequestException('Esta fatura ainda nao foi gerada no gateway.');
        gatewayMsg = 'Fatura nao estava gerada no gateway; removida apenas no Recorrai.';
      } else {
        try {
          const provider = await this.factory.forAccount(inv.providerAccountId);
          await provider.cancelCharge(inv.externalId);
          gatewayMsg = 'Cobranca cancelada no gateway.';
        } catch (e: any) {
          const detail = e?.response?.data ? JSON.stringify(e.response.data) : e?.message || String(e);
          console.error('[removeInvoice] cancelamento no gateway falhou:', detail);
          throw new BadRequestException('Nao foi possivel cancelar a cobranca no gateway.');
        }
      }
    }

    if (escopo === 'gateway') {
      const upd = await this.prisma.invoice.update({
        where: { id },
        data: { status: 'CANCELADA', pixCopiaCola: null, boletoLinha: null, boletoUrl: null, linkPagamento: null },
      });
      await this.audit.record({
        tenantId, userId: actorId, acao: 'invoice.cancel', entidade: 'Invoice', entidadeId: id,
        antes: { status: inv.status }, depois: { status: 'CANCELADA', escopo },
      });
      return { ok: true, escopo, mantidoNoRecorra: true, invoice: upd, mensagem: gatewayMsg };
    }

    await this.prisma.invoice.delete({ where: { id } });
    await this.audit.record({
      tenantId, userId: actorId, acao: 'invoice.delete', entidade: 'Invoice', entidadeId: id,
      antes: { status: inv.status, valor: Number(inv.valor), escopo },
    });
    return { ok: true, escopo, mantidoNoRecorra: false, mensagem: gatewayMsg };
  }

  /**
   * Exclusão em massa. Por segurança, **só apaga o registro local (escopo
   * 'recorra')** — nunca cancela no gateway. Cancelar no gateway é irreversível
   * e afeta o cliente real, então é uma ação deliberada, feita uma a uma pelo
   * removeInvoice. Isso torna impossível cancelar dezenas de cobranças no
   * gateway por um clique de engano na limpeza em massa.
   *
   * Percorre uma a uma (em vez de deleteMany) para gerar auditoria por fatura.
   * Uma falha isolada não derruba o lote: entra em `erros` e as demais seguem.
   */
  async removeMany(tenantId: string, ids: string[], actorId?: string) {
    const alvo = [...new Set(ids)].filter(Boolean);
    const out = { total: alvo.length, excluidas: 0, erros: [] as { id: string; erro: string }[] };
    for (const id of alvo) {
      try {
        await this.removeInvoice(tenantId, id, 'recorra', actorId);
        out.excluidas += 1;
      } catch (e) {
        out.erros.push({ id, erro: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  }

  /**
   * Reavalia o status pela data: marca como VENCIDA as faturas PENDENTE do tenant
   * cujo vencimento já passou. Mesma regra do cron diário, mas sob demanda — para
   * o usuário não esperar a rotina automática. Borda em UTC (igual ao vencimento,
   * gravado à meia-noite UTC); vence hoje ainda conta como pendente.
   */
  async reavaliarStatus(tenantId: string) {
    const n = new Date();
    const hojeUtc = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
    const r = await this.prisma.invoice.updateMany({
      where: { tenantId, status: 'PENDENTE', vencimento: { lt: hojeUtc } },
      data: { status: 'VENCIDA' },
    });
    return { atualizadas: r.count };
  }
}
