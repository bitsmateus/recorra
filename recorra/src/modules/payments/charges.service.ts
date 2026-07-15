import { ForbiddenException, Injectable, NotFoundException , BadRequestException } from '@nestjs/common';
import { ChargeMethod, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/common/audit/audit.service';
import { PaymentProviderFactory } from './payment-provider.factory';
import { SplitRuleInput } from './payment-provider.interface';
import { computeSplit } from './split';
import { canTransition } from './invoice-status';
import { featureEnabled, PlanTier, Feature } from '@/modules/platform/plans';
import { onlyDigits } from "@/common/util/normalize";
import * as XLSX from 'xlsx';

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
      : { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] as InvoiceStatus[] }, externalId: null };

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

  /** Importa clientes e cobrancas existentes de um gateway (ex.: Asaas) para o Recorra. */
  async importarDoGateway(tenantId: string, accountId: string) {
    const account = await this.prisma.paymentProviderAccount.findFirst({ where: { id: accountId, tenantId } });
    if (!account) throw new NotFoundException("Conta de gateway nao encontrada");
    const provider = await this.factory.forAccount(accountId);
    if (!provider.supportsImport?.() || !provider.listCustomers || !provider.listPayments) {
      throw new BadRequestException("Este gateway ainda nao suporta importacao");
    }

    const result = { clientes: 0, clientesAtualizados: 0, faturas: 0, faturasAtualizadas: 0, ignorados: 0 };
    const extToCustomerId = new Map<string, string>();

    try {
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

    const pagamentos = await provider.listPayments();
    for (const p of pagamentos) {
      const customerId = extToCustomerId.get(p.customerExternalId);
      if (!customerId) { result.ignorados++; continue; }
      const existing = await this.prisma.invoice.findFirst({ where: { tenantId, provider: account.provider, externalId: p.externalId } });
      const data = {
        valor: p.valor,
        vencimento: p.vencimento,
        status: p.status as any,
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

  listInvoices(
    tenantId: string,
    filtros: {
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
    } = {},
  ) {
    const where: any = { tenantId };
    if (filtros.status) where.status = filtros.status;
    if (filtros.customerId) where.customerId = filtros.customerId;
    if (filtros.metodo) where.metodo = filtros.metodo;
    if (filtros.origem) where.origem = filtros.origem;
    if (filtros.geracao === 'gerada') where.externalId = { not: null };
    if (filtros.geracao === 'pendente') where.externalId = null;
    if (filtros.q) {
      const q = filtros.q.trim();
      where.customer = { OR: [{ nome: { contains: q, mode: 'insensitive' } }, { doc: { contains: q.replace(/\D/g, '') } }] };
    }
    if (filtros.etiqueta) {
      where.customer = { ...(where.customer ?? {}), tags: { has: filtros.etiqueta.toLowerCase() } };
    }
    if (filtros.de || filtros.ate) {
      where.vencimento = {
        ...(filtros.de ? { gte: new Date(filtros.de) } : {}),
        ...(filtros.ate ? { lte: new Date(filtros.ate + 'T23:59:59') } : {}),
      };
    }
    if (filtros.valorMin || filtros.valorMax) {
      where.valor = {
        ...(filtros.valorMin ? { gte: Number(filtros.valorMin) } : {}),
        ...(filtros.valorMax ? { lte: Number(filtros.valorMax) } : {}),
      };
    }
    return this.prisma.invoice.findMany({
      where,
      include: { customer: { select: { nome: true, doc: true } } },
      orderBy: { vencimento: 'asc' },
      take: 500,
    });
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
      // (evita divergência Recorra × gateway).
      if (inv.externalId) throw new BadRequestException('Fatura ja emitida no gateway: valor nao pode ser alterado. Cancele e gere uma nova.');
      data.valor = valor;
    }
    if (dto.vencimento) data.vencimento = new Date(dto.vencimento);
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
        gatewayMsg = 'Fatura nao estava gerada no gateway; removida apenas no Recorra.';
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
}
