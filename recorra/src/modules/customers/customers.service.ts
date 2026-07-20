import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RiskBand } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { onlyDigits } from '@/common/util/normalize';
import { isValidCpfCnpj, isValidEmail, toE164BR } from '@/common/util/validators';
import { UpsertCustomerDto } from './dto/customer.dto';

export interface SegmentFilter {
  q?: string;
  tags?: string[];
  plano?: string;
  uf?: string;
  valorMin?: number;
  valorMax?: number;
  faixa?: RiskBand;
  ativo?: boolean;
  etiqueta?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Valida e normaliza os campos do cliente. */
  private sanitize(dto: UpsertCustomerDto) {
    const doc = onlyDigits(dto.doc);
    if (!isValidCpfCnpj(doc)) throw new BadRequestException('CPF/CNPJ inválido');

    let telefone: string | undefined;
    if (dto.telefone) {
      const e164 = toE164BR(dto.telefone);
      if (!e164) throw new BadRequestException('Telefone inválido');
      telefone = e164;
    }

    if (dto.email && !isValidEmail(dto.email)) throw new BadRequestException('E-mail inválido');

    return {
      nome: dto.nome.trim(),
      doc,
      email: dto.email?.trim() || null,
      telefone: telefone ?? null,
      contrato: dto.contrato?.trim() || null,
      plano: dto.plano?.trim() || null,
      valorPlano: dto.valorPlano ?? null,
      cidade: dto.cidade?.trim() || null,
      uf: dto.uf?.trim().toUpperCase() || null,
      tags: dto.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean) ?? [],
    };
  }

  /** Cria cliente manual (dedupe por doc). */
  async create(tenantId: string, dto: UpsertCustomerDto) {
    const data = this.sanitize(dto);
    const existing = await this.prisma.customer.findUnique({
      where: { tenantId_doc: { tenantId, doc: data.doc } },
    });
    if (existing) throw new BadRequestException('Já existe cliente com este CPF/CNPJ');
    return this.prisma.customer.create({ data: { tenantId, ...data } });
  }

  async update(tenantId: string, id: string, dto: UpsertCustomerDto) {
    await this.getOrThrow(tenantId, id);
    const data = this.sanitize(dto);
    return this.prisma.customer.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    await this.getOrThrow(tenantId, id);
    await this.prisma.customer.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Exclusão em massa. O `deleteMany` filtra por tenant, então ids de outro
   * tenant são simplesmente ignorados (não apagam nada) — e a operação é
   * atômica: ou remove todos os selecionados válidos, ou nenhum.
   */
  async removeMany(tenantId: string, ids: string[]) {
    const alvo = [...new Set(ids)].filter(Boolean);
    if (!alvo.length) return { excluidos: 0 };
    const r = await this.prisma.customer.deleteMany({ where: { tenantId, id: { in: alvo } } });
    return { excluidos: r.count };
  }

  async getOrThrow(tenantId: string, id: string) {
    const c = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Cliente não encontrado');
    return c;
  }

  /** Segmentação: filtra por texto, tags, plano, uf, faixa de valor e risco. */
  async segment(tenantId: string, f: SegmentFilter) {
    const where: Prisma.CustomerWhereInput = { tenantId };
    if (f.ativo !== undefined) where.ativo = f.ativo;
    if (f.q?.trim()) {
      // Busca por nome (case-insensitive) e, só quando o termo tem dígitos, por documento.
      // Sem esse guard, onlyDigits('brava') === '' e { doc: { contains: '' } } casaria com
      // todos os clientes, anulando o filtro por nome.
      const termo = f.q.trim();
      const digitos = onlyDigits(termo);
      const or: Prisma.CustomerWhereInput[] = [{ nome: { contains: termo, mode: 'insensitive' } }];
      if (digitos) or.push({ doc: { contains: digitos } });
      where.OR = or;
    }
    if (f.tags?.length) where.tags = { hasEvery: f.tags.map((t) => t.toLowerCase()) };
    if (f.etiqueta) where.tags = { has: f.etiqueta.toLowerCase() };
    if (f.plano) where.plano = f.plano;
    if (f.uf) where.uf = f.uf.toUpperCase();
    if (f.valorMin !== undefined || f.valorMax !== undefined) {
      where.valorPlano = {
        ...(f.valorMin !== undefined ? { gte: f.valorMin } : {}),
        ...(f.valorMax !== undefined ? { lte: f.valorMax } : {}),
      };
    }

    let customers = await this.prisma.customer.findMany({ where, take: 500, orderBy: { nome: 'asc' } });

    // Filtro por faixa de risco (usa o score mais recente de cada cliente).
    if (f.faixa) {
      const ids = customers.map((c) => c.id);
      const scores = await this.prisma.riskScore.findMany({
        where: { tenantId, customerId: { in: ids } },
        orderBy: { calculadoEm: 'desc' },
      });
      const faixaByCustomer = new Map<string, RiskBand>();
      for (const s of scores) if (!faixaByCustomer.has(s.customerId)) faixaByCustomer.set(s.customerId, s.faixa);
      customers = customers.filter((c) => faixaByCustomer.get(c.id) === f.faixa);
    }

    // Anexa contagem de cobrancas (criadas e pagas) por cliente.
    const custIds = customers.map((c) => c.id);
    const grouped = custIds.length
      ? await this.prisma.invoice.groupBy({
          by: ['customerId', 'status'],
          where: { tenantId, customerId: { in: custIds } },
          _count: { _all: true },
        })
      : [];
    const totalBy = new Map<string, number>();
    const pagaBy = new Map<string, number>();
    for (const g of grouped) {
      totalBy.set(g.customerId, (totalBy.get(g.customerId) ?? 0) + g._count._all);
      if (g.status === 'PAGA') pagaBy.set(g.customerId, (pagaBy.get(g.customerId) ?? 0) + g._count._all);
    }
    return customers.map((c) => ({
      ...c,
      cobrancasTotal: totalBy.get(c.id) ?? 0,
      cobrancasPagas: pagaBy.get(c.id) ?? 0,
    }));
  }

  /** Adiciona/remove tags de um cliente. */
  async setTags(tenantId: string, id: string, tags: string[]) {
    await this.getOrThrow(tenantId, id);
    const norm = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    return this.prisma.customer.update({ where: { id }, data: { tags: norm } });
  }

  /** Lista todas as tags distintas do tenant (para filtros na UI). */
  async listTags(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.customer.findMany({ where: { tenantId }, select: { tags: true } });
    const set = new Set<string>();
    for (const r of rows) r.tags.forEach((t) => set.add(t));
    return [...set].sort();
  }
  /** Lista etiquetas do catálogo (Tag) unidas às tags já usadas em clientes. */
  async listEtiquetas(tenantId: string) {
    const [catalogo, rows] = await Promise.all([
      this.prisma.tag.findMany({ where: { tenantId }, orderBy: { nome: 'asc' } }),
      this.prisma.customer.findMany({ where: { tenantId }, select: { tags: true } }),
    ]);
    const map = new Map<string, { nome: string; cor: string | null }>();
    for (const t of catalogo) map.set(t.nome, { nome: t.nome, cor: t.cor });
    for (const r of rows) for (const t of r.tags) if (!map.has(t)) map.set(t, { nome: t, cor: null });
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }

  /** Cria/atualiza uma etiqueta no catálogo. */
  async criarEtiqueta(tenantId: string, nome: string, cor?: string) {
    const n = nome.trim().toLowerCase();
    if (!n) throw new BadRequestException('Nome da etiqueta é obrigatório');
    return this.prisma.tag.upsert({
      where: { tenantId_nome: { tenantId, nome: n } },
      create: { tenantId, nome: n, cor: cor || null },
      update: { cor: cor || null },
    });
  }

  /** Remove a etiqueta do catálogo (não altera clientes já marcados). */
  async excluirEtiqueta(tenantId: string, nome: string) {
    await this.prisma.tag.deleteMany({ where: { tenantId, nome: nome.trim().toLowerCase() } });
    return { ok: true };
  }

  /** Detalhe completo do cliente: dados + risco + faturas + disparos + acordos + assinaturas. */
  async getDetalhe(tenantId: string, id: string) {
    const customer = await this.getOrThrow(tenantId, id);
    const [risco, features, faturas, disparos, acordos, assinaturas] = await Promise.all([
      this.prisma.riskScore.findFirst({ where: { tenantId, customerId: id }, orderBy: { calculadoEm: "desc" } }),
      this.prisma.paymentHistoryFeature.findUnique({ where: { customerId: id } }),
      this.prisma.invoice.findMany({ where: { tenantId, customerId: id }, orderBy: { vencimento: "desc" }, take: 100 }),
      this.prisma.messageDispatch.findMany({ where: { tenantId, customerId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.prisma.agreement.findMany({ where: { tenantId, customerId: id }, include: { installments: { orderBy: { numero: "asc" } } }, orderBy: { createdAt: "desc" } }),
      this.prisma.subscription.findMany({ where: { tenantId, customerId: id }, orderBy: { createdAt: "desc" } }),
    ]);
    const emAberto = faturas.filter((f) => f.status === "PENDENTE" || f.status === "VENCIDA").reduce((s, f) => s + Number(f.valor), 0);
    const pago = faturas.filter((f) => f.status === "PAGA").reduce((s, f) => s + Number(f.valor), 0);
    const vencidas = faturas.filter((f) => f.status === "VENCIDA").length;
    return { customer, risco, features, faturas, disparos, acordos, assinaturas, totais: { emAberto, pago, vencidas } };
  }
}
