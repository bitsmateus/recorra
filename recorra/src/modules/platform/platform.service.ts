import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PlanTier, UserRole } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { env } from '@/config/env';
import { generateTotpSecret, totpAuthUrl, verifyTotp } from '@/common/auth/totp';
import { detectAnomalies } from './anomaly';
import { PLANS } from './plans';

export interface PlanoInput {
  nome?: string;
  preco?: number;
  sobConsulta?: boolean;
  maxClientes?: number;
  disparosInclusos?: number;
  custoExcedente?: number;
  maxUsuarios?: number;
  features?: unknown[];
  ativo?: boolean;
  ordem?: number;
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, senha: string, codigo?: string) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email } });
    if (!admin || !admin.ativo) throw new UnauthorizedException('Credenciais invalidas');
    const ok = await argon2.verify(admin.senhaHash, senha);
    if (!ok) throw new UnauthorizedException('Credenciais invalidas');
    // 2FA (TOTP) obrigatório quando ativado — o superadmin controla todos os tenants.
    if (admin.twoFaEnabled && admin.twoFaSecret) {
      if (!codigo) throw new UnauthorizedException('2FA_REQUIRED');
      if (!verifyTotp(codigo, admin.twoFaSecret)) throw new UnauthorizedException('Código 2FA inválido');
    }
    const token = await this.jwt.signAsync(
      { sub: admin.id, email: admin.email, scope: 'platform' },
      { secret: env.JWT_SECRET, expiresIn: '8h' },
    );
    return { accessToken: token, nome: admin.nome, twoFaEnabled: admin.twoFaEnabled };
  }

  /** Inicia a configuração de 2FA do superadmin (retorna o segredo/otpauth). */
  async setup2fa(adminId: string) {
    const secret = generateTotpSecret();
    const admin = await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: { twoFaSecret: secret, twoFaEnabled: false },
    });
    return { secret, otpauthUrl: totpAuthUrl(admin.email, secret) };
  }

  /** Confirma o código e ativa o 2FA do superadmin. */
  async enable2fa(adminId: string, codigo: string) {
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: adminId } });
    if (!admin.twoFaSecret) throw new BadRequestException('Configure o 2FA primeiro');
    if (!verifyTotp(codigo, admin.twoFaSecret)) throw new BadRequestException('Código inválido');
    await this.prisma.platformAdmin.update({ where: { id: adminId }, data: { twoFaEnabled: true } });
    return { ok: true };
  }

  // ---------------- Tenants ----------------

  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({ orderBy: { createdAt: 'desc' }, include: { plan: { select: { id: true, nome: true } } } });
    const out = [];
    for (const t of tenants) {
      const [clientes, faturas, disparos] = await Promise.all([
        this.prisma.customer.count({ where: { tenantId: t.id } }),
        this.prisma.invoice.count({ where: { tenantId: t.id } }),
        this.prisma.messageDispatch.count({ where: { tenantId: t.id } }),
      ]);
      out.push({ id: t.id, nome: t.nome, cnpj: t.cnpj, plano: t.plano, planId: t.planId, planoNome: t.plan?.nome ?? null, ativo: t.ativo, criadoEm: t.createdAt, uso: { clientes, faturas, disparos } });
    }
    return out;
  }

  async tenantDetail(id: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id } });
    const [usuarios, clientes, faturas, disparos, recuperado] = await Promise.all([
      this.prisma.user.findMany({ where: { tenantId: id }, select: { id: true, nome: true, email: true, role: true, ativo: true, emailVerify: true, twoFaEnabled: true } }),
      this.prisma.customer.count({ where: { tenantId: id } }),
      this.prisma.invoice.count({ where: { tenantId: id } }),
      this.prisma.messageDispatch.count({ where: { tenantId: id } }),
      this.prisma.invoice.aggregate({ where: { tenantId: id, status: 'PAGA' }, _sum: { valor: true } }),
    ]);
    return { tenant, usuarios, uso: { clientes, faturas, disparos, recuperado: Number(recuperado._sum.valor ?? 0) } };
  }

  async createTenant(input: { empresa: string; cnpj?: string; nome: string; email: string; senha: string; plano?: PlanTier }) {
    const existing = await this.prisma.user.findFirst({ where: { email: input.email } });
    if (existing) throw new ConflictException('E-mail ja cadastrado');
    const senhaHash = await argon2.hash(input.senha, { type: argon2.argon2id });
    const tenant = await this.prisma.tenant.create({
      data: {
        nome: input.empresa,
        cnpj: input.cnpj,
        plano: input.plano ?? 'TRIAL',
        users: { create: { nome: input.nome, email: input.email, senhaHash, role: 'OWNER', emailVerify: true } },
      },
    });
    return { id: tenant.id, nome: tenant.nome };
  }

  async updateTenant(id: string, patch: { nome?: string; cnpj?: string; ativo?: boolean; plano?: PlanTier; planId?: string | null }) {
    return this.prisma.tenant.update({
      where: { id },
      // planId: string vincula ao catálogo; null desvincula (volta a usar o enum `plano`).
      data: { nome: patch.nome, cnpj: patch.cnpj, ativo: patch.ativo, plano: patch.plano, ...(patch.planId !== undefined ? { planId: patch.planId } : {}) },
      select: { id: true, nome: true, cnpj: true, ativo: true, plano: true, planId: true },
    });
  }

  // ---------------- Exclusão de tenant ----------------

  /**
   * O que será apagado junto com o tenant. Serve para o superadmin confirmar de
   * forma consciente — a exclusão é irreversível e leva TODOS os dados junto.
   */
  async tenantDeletePreview(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, select: { id: true, nome: true } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    const [usuarios, clientes, faturas, disparos, campanhas, reguas, faturasSaas] = await Promise.all([
      this.prisma.user.count({ where: { tenantId: id } }),
      this.prisma.customer.count({ where: { tenantId: id } }),
      this.prisma.invoice.count({ where: { tenantId: id } }),
      this.prisma.messageDispatch.count({ where: { tenantId: id } }),
      this.prisma.campaign.count({ where: { tenantId: id } }),
      this.prisma.dunningRule.count({ where: { tenantId: id } }),
      this.prisma.platformInvoice.count({ where: { tenantId: id } }),
    ]);
    return { tenant, apagara: { usuarios, clientes, faturas, disparos, campanhas, reguas, faturasSaas } };
  }

  /**
   * Exclui o tenant e todo o dado dele. Exige o nome exato da empresa como
   * confirmação (evita apagar o tenant errado por clique acidental).
   * As faturas do SaaS não têm FK com o tenant, então são removidas à mão —
   * sem isso ficariam órfãs e sujando o financeiro da plataforma.
   */
  async deleteTenant(id: string, confirmacaoNome: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, select: { id: true, nome: true } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    if ((confirmacaoNome ?? '').trim() !== tenant.nome.trim()) {
      throw new BadRequestException(`Digite exatamente "${tenant.nome}" para confirmar a exclusão.`);
    }
    await this.prisma.$transaction([
      this.prisma.platformInvoice.deleteMany({ where: { tenantId: id } }),
      this.prisma.tenant.delete({ where: { id } }),
    ]);
    return { ok: true, nome: tenant.nome };
  }

  // ---------------- Usuários do tenant ----------------

  private readonly userSelect = {
    id: true, nome: true, email: true, role: true, ativo: true,
    emailVerify: true, twoFaEnabled: true, convidado: true, provider: true, createdAt: true,
  } as const;

  listTenantUsers(tenantId: string) {
    return this.prisma.user.findMany({ where: { tenantId }, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }], select: this.userSelect });
  }

  private async acharUsuario(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('Usuário não encontrado neste tenant');
    return user;
  }

  /**
   * Impede deixar o tenant sem nenhum OWNER ativo — sem isso, o cliente perderia
   * o acesso administrativo à própria conta e só o superadmin poderia devolver.
   */
  private async assertNaoEUltimoOwner(tenantId: string, userId: string, atual: { role: UserRole; ativo: boolean }, novo: { role?: UserRole; ativo?: boolean }) {
    const perdeOwner = (novo.role !== undefined && novo.role !== 'OWNER') || novo.ativo === false;
    if (atual.role !== 'OWNER' || !atual.ativo || !perdeOwner) return;
    const outros = await this.prisma.user.count({ where: { tenantId, role: 'OWNER', ativo: true, id: { not: userId } } });
    if (outros === 0) throw new BadRequestException('Este é o único OWNER ativo do tenant. Promova outro usuário a OWNER antes de rebaixar, desativar ou excluir este.');
  }

  async createTenantUser(tenantId: string, input: { nome: string; email: string; senha: string; role?: UserRole }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    const nome = input.nome?.trim();
    const email = input.email?.trim().toLowerCase();
    if (!nome || !email) throw new BadRequestException('Nome e e-mail são obrigatórios');
    if (!input.senha || input.senha.length < 8) throw new BadRequestException('A senha precisa ter ao menos 8 caracteres');
    const existe = await this.prisma.user.findFirst({ where: { tenantId, email } });
    if (existe) throw new ConflictException('Já existe um usuário com este e-mail neste tenant');
    const senhaHash = await argon2.hash(input.senha, { type: argon2.argon2id });
    return this.prisma.user.create({
      data: { tenantId, nome, email, senhaHash, role: input.role ?? 'OPERADOR', emailVerify: true },
      select: this.userSelect,
    });
  }

  async updateTenantUser(tenantId: string, userId: string, patch: { nome?: string; email?: string; role?: UserRole; ativo?: boolean }) {
    const user = await this.acharUsuario(tenantId, userId);
    await this.assertNaoEUltimoOwner(tenantId, userId, user, patch);
    const email = patch.email?.trim().toLowerCase();
    if (email && email !== user.email) {
      const existe = await this.prisma.user.findFirst({ where: { tenantId, email, id: { not: userId } } });
      if (existe) throw new ConflictException('Já existe um usuário com este e-mail neste tenant');
    }
    const atualizado = await this.prisma.user.update({
      where: { id: userId },
      data: { nome: patch.nome?.trim(), email, role: patch.role, ativo: patch.ativo },
      select: this.userSelect,
    });
    // Desativar precisa derrubar a sessão na hora, senão o usuário segue navegando
    // com o refresh token que já tinha.
    if (patch.ativo === false) await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return atualizado;
  }

  /** Define uma nova senha para o usuário e derruba as sessões ativas dele. */
  async resetTenantUserSenha(tenantId: string, userId: string, senha: string) {
    await this.acharUsuario(tenantId, userId);
    if (!senha || senha.length < 8) throw new BadRequestException('A senha precisa ter ao menos 8 caracteres');
    const senhaHash = await argon2.hash(senha, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: userId },
      data: { senhaHash, resetToken: null, resetTokenExp: null, emailVerify: true },
    });
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async deleteTenantUser(tenantId: string, userId: string) {
    const user = await this.acharUsuario(tenantId, userId);
    await this.assertNaoEUltimoOwner(tenantId, userId, user, { ativo: false });
    await this.prisma.user.delete({ where: { id: userId } });
    return { ok: true };
  }

  async tenantHealth(tenantId: string) {
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 1);
    const [filaPendente, enviados, falhas, webhooksNaoProcessados, canais] = await Promise.all([
      this.prisma.messageDispatch.count({ where: { tenantId, status: 'FILA' } }),
      this.prisma.messageDispatch.count({ where: { tenantId, status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] }, createdAt: { gte: inicio } } }),
      this.prisma.messageDispatch.count({ where: { tenantId, status: 'FALHA', createdAt: { gte: inicio } } }),
      this.prisma.webhookEvent.count({ where: { tenantId, processadoEm: null } }),
      this.prisma.channelAccount.findMany({ where: { tenantId }, select: { canal: true, ativo: true } }),
    ]);
    const metrics = { enviados, falhas, filaPendente, webhooksNaoProcessados };
    return { metrics, canais, anomalias: detectAnomalies(metrics) };
  }

  async setFeatureFlags(tenantId: string, flags: Record<string, boolean>) {
    return this.prisma.tenant.update({ where: { id: tenantId }, data: { featureFlags: flags }, select: { id: true, featureFlags: true } });
  }

  // ---------------- Financeiro do SaaS ----------------

  async financeiro() {
    const [faturado, recebido, aberto, totalFaturas, porPlano] = await Promise.all([
      this.prisma.platformInvoice.aggregate({ _sum: { valorTotal: true } }),
      this.prisma.platformInvoice.aggregate({ where: { status: 'paga' }, _sum: { valorTotal: true } }),
      this.prisma.platformInvoice.aggregate({ where: { status: 'aberta' }, _sum: { valorTotal: true } }),
      this.prisma.platformInvoice.count(),
      this.prisma.tenant.groupBy({ by: ['plano'], _count: true, where: { ativo: true } }),
    ]);
    // MRR estimado: soma a mensalidade dos tenants ativos. Quem tem plano do catálogo
    // (planId) usa o preço dele; senão cai no preço do enum legado. "Sob consulta" = 0.
    const ativos = await this.prisma.tenant.findMany({
      where: { ativo: true },
      select: { plano: true, plan: { select: { preco: true, sobConsulta: true } } },
    });
    const mrr = ativos.reduce((s, t) => {
      if (t.plan) return s + (t.plan.sobConsulta ? 0 : Number(t.plan.preco));
      return s + (PLANS[t.plano as keyof typeof PLANS]?.preco ?? 0);
    }, 0);
    return {
      faturado: Number(faturado._sum.valorTotal ?? 0),
      recebido: Number(recebido._sum.valorTotal ?? 0),
      aberto: Number(aberto._sum.valorTotal ?? 0),
      totalFaturas,
      mrr,
      porPlano: porPlano.map((p) => ({ plano: p.plano, tenants: p._count })),
    };
  }

  async listAllInvoices(status?: string) {
    const invoices = await this.prisma.platformInvoice.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const ids = [...new Set(invoices.map((i) => i.tenantId))];
    const tenants = await this.prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } });
    const nameMap = new Map(tenants.map((t) => [t.id, t.nome]));
    return invoices.map((i) => ({ ...i, tenantNome: nameMap.get(i.tenantId) ?? '-' }));
  }

  async marcarFaturaPaga(id: string, paga: boolean) {
    return this.prisma.platformInvoice.update({ where: { id }, data: { status: paga ? 'paga' : 'aberta' }, select: { id: true, status: true } });
  }

  // ---------------- Planos (catalogo editável) ----------------

  /** Normaliza os Decimais do banco para número, no formato que a UI consome. */
  private mapPlano(p: {
    id: string; nome: string; preco: unknown; sobConsulta: boolean; maxClientes: number;
    disparosInclusos: number; custoExcedente: unknown; maxUsuarios: number; features: string[]; ativo: boolean; ordem: number;
  }) {
    return {
      id: p.id, nome: p.nome, preco: Number(p.preco), sobConsulta: p.sobConsulta,
      maxClientes: p.maxClientes, disparosInclusos: p.disparosInclusos, custoExcedente: Number(p.custoExcedente),
      maxUsuarios: p.maxUsuarios, features: p.features, ativo: p.ativo, ordem: p.ordem, editavel: true,
    };
  }

  /** Catálogo do banco; se ainda não foi semeado, cai no constante legado para não vir vazio. */
  async listPlanos() {
    const rows = await this.prisma.plan.findMany({ orderBy: [{ ordem: 'asc' }, { preco: 'asc' }] });
    if (rows.length === 0) {
      // Fallback: catálogo ainda não semeado. Não editável (não existe linha no banco).
      return Object.values(PLANS).map((p, i) => ({
        id: p.tier, nome: p.nome, preco: p.preco, sobConsulta: false, maxClientes: p.maxClientes,
        disparosInclusos: p.disparosInclusos, custoExcedente: p.custoExcedente, maxUsuarios: p.maxUsuarios,
        features: p.features as string[], ativo: true, ordem: i, editavel: false,
      }));
    }
    return rows.map((p) => this.mapPlano(p));
  }

  private sanitizePlano(b: PlanoInput) {
    const sobConsulta = !!b.sobConsulta;
    return {
      nome: (b.nome ?? '').trim(),
      preco: sobConsulta ? 0 : Math.max(0, Number(b.preco) || 0),
      sobConsulta,
      maxClientes: Number.isFinite(Number(b.maxClientes)) ? Number(b.maxClientes) : -1,
      disparosInclusos: Math.max(0, Number(b.disparosInclusos) || 0),
      custoExcedente: Math.max(0, Number(b.custoExcedente) || 0),
      maxUsuarios: Number.isFinite(Number(b.maxUsuarios)) ? Number(b.maxUsuarios) : -1,
      features: Array.isArray(b.features) ? b.features.filter((f): f is string => typeof f === 'string') : [],
      ativo: b.ativo === undefined ? true : !!b.ativo,
      ordem: Number(b.ordem) || 0,
    };
  }

  async createPlano(body: PlanoInput) {
    const data = this.sanitizePlano(body);
    if (!data.nome) throw new BadRequestException('Nome do plano é obrigatório.');
    const p = await this.prisma.plan.create({ data });
    return this.mapPlano(p);
  }

  async updatePlano(id: string, body: PlanoInput) {
    const data = this.sanitizePlano(body);
    if (!data.nome) throw new BadRequestException('Nome do plano é obrigatório.');
    const p = await this.prisma.plan.update({ where: { id }, data });
    return this.mapPlano(p);
  }

  async deletePlano(id: string) {
    const emUso = await this.prisma.tenant.count({ where: { planId: id } });
    if (emUso > 0) throw new ConflictException(`Este plano está em uso por ${emUso} cliente(s). Troque-os de plano antes de excluir.`);
    await this.prisma.plan.delete({ where: { id } });
    return { ok: true };
  }

  // ---------------- Admins da plataforma ----------------

  async listAdmins() {
    const rows = await this.prisma.platformAdmin.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(({ senhaHash, ...r }) => {
      void senhaHash;
      return r;
    });
  }

  async createAdmin(input: { nome: string; email: string; senha: string }) {
    const existing = await this.prisma.platformAdmin.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('E-mail ja cadastrado');
    const senhaHash = await argon2.hash(input.senha, { type: argon2.argon2id });
    const a = await this.prisma.platformAdmin.create({ data: { nome: input.nome, email: input.email, senhaHash } });
    return { id: a.id, nome: a.nome, email: a.email };
  }

  // ---------------- Métricas gerais ----------------

  async metrics() {
    const [tenants, ativos, clientes, disparos, recuperado] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { ativo: true } }),
      this.prisma.customer.count(),
      this.prisma.messageDispatch.count(),
      this.prisma.invoice.aggregate({ where: { status: 'PAGA' }, _sum: { valor: true } }),
    ]);
    return { tenants, tenantsAtivos: ativos, clientes, disparos, recuperadoTotal: Number(recuperado._sum.valor ?? 0) };
  }

  // ---------------- Relatórios (superadmin) ----------------

  /** MRR: soma da mensalidade dos tenants ativos (plano do catálogo ou enum legado; sob consulta = 0). */
  private async calcularMrr(): Promise<number> {
    const ativos = await this.prisma.tenant.findMany({
      where: { ativo: true },
      select: { plano: true, plan: { select: { preco: true, sobConsulta: true } } },
    });
    return ativos.reduce((s, t) => {
      if (t.plan) return s + (t.plan.sobConsulta ? 0 : Number(t.plan.preco));
      return s + (PLANS[t.plano as keyof typeof PLANS]?.preco ?? 0);
    }, 0);
  }

  /** Últimos N meses como buckets [gte, lt) com chave YYYY-MM e rótulo curto. */
  private ultimosMeses(n: number) {
    const hoje = new Date();
    const chave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - (n - 1) + i, 1);
      const prox = new Date(hoje.getFullYear(), hoje.getMonth() - (n - 1) + i + 1, 1);
      return { mes: chave(d), label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), gte: d, lt: prox };
    });
  }

  /** Distintos tenantIds com registro ativo numa tabela de setup (para o funil de implementação). */
  private async tenantsCom(model: 'channelAccount' | 'paymentProviderAccount' | 'dunningRule' | 'sourceIntegration'): Promise<Set<string>> {
    const rows = await (this.prisma[model] as { groupBy: (a: unknown) => Promise<{ tenantId: string }[]> }).groupBy({ by: ['tenantId'], where: { ativo: true } });
    return new Set(rows.map((r) => r.tenantId));
  }

  /** Relatório financeiro do SaaS: MRR, receita por mês e implementações (novos tenants e ativos "live"). */
  async relatorioFinanceiro() {
    const meses = this.ultimosMeses(12);
    const [mrr, tenantsTotal, tenantsAtivos, faturasPorMes, recebidasPorMes, novosPorMes, comCanal, comGateway, comRegua, comIntegracao, clientesRows] = await Promise.all([
      this.calcularMrr(),
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { ativo: true } }),
      this.prisma.platformInvoice.groupBy({ by: ['competencia'], _sum: { valorTotal: true } }),
      this.prisma.platformInvoice.groupBy({ by: ['competencia'], where: { status: 'paga' }, _sum: { valorTotal: true } }),
      Promise.all(meses.map((m) => this.prisma.tenant.count({ where: { createdAt: { gte: m.gte, lt: m.lt } } }))),
      this.tenantsCom('channelAccount'),
      this.tenantsCom('paymentProviderAccount'),
      this.tenantsCom('dunningRule'),
      this.tenantsCom('sourceIntegration'),
      this.prisma.customer.groupBy({ by: ['tenantId'] }),
    ]);

    const fatMap = new Map(faturasPorMes.map((f) => [f.competencia, Number(f._sum.valorTotal ?? 0)]));
    const recMap = new Map(recebidasPorMes.map((f) => [f.competencia, Number(f._sum.valorTotal ?? 0)]));
    const receitaMensal = meses.map((m) => ({ mes: m.mes, label: m.label, faturado: fatMap.get(m.mes) ?? 0, recebido: recMap.get(m.mes) ?? 0 }));
    const novosTenants = meses.map((m, i) => ({ mes: m.mes, label: m.label, novos: novosPorMes[i] }));

    // Implementado ("live") = tem canal + gateway + régua + (clientes ou integração).
    const temBase = new Set<string>([...clientesRows.map((c) => c.tenantId), ...comIntegracao]);
    let implementados = 0;
    for (const id of comCanal) if (comGateway.has(id) && comRegua.has(id) && temBase.has(id)) implementados++;

    return { mrr, tenantsTotal, tenantsAtivos, implementados, receitaMensal, novosTenants };
  }

  /** Relatório de disparos do SaaS: volume por mês, por canal, por status e ranking de tenants. */
  async relatorioDisparos() {
    const meses = this.ultimosMeses(12);
    const [total, porMesCounts, porCanal, porStatus, ranking] = await Promise.all([
      this.prisma.messageDispatch.count(),
      Promise.all(meses.map((m) => this.prisma.messageDispatch.count({ where: { createdAt: { gte: m.gte, lt: m.lt } } }))),
      this.prisma.messageDispatch.groupBy({ by: ['canal'], _count: { _all: true } }),
      this.prisma.messageDispatch.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.messageDispatch.groupBy({ by: ['tenantId'], _count: { _all: true }, orderBy: { _count: { tenantId: 'desc' } }, take: 10 }),
    ]);

    const nomes = new Map(
      (await this.prisma.tenant.findMany({ where: { id: { in: ranking.map((r) => r.tenantId) } }, select: { id: true, nome: true } })).map((t) => [t.id, t.nome]),
    );
    const tipoDe = (c: string) => (c.startsWith('WHATSAPP') ? 'WHATSAPP' : c);
    const canalMap = new Map<string, number>();
    for (const g of porCanal) { const k = tipoDe(g.canal); canalMap.set(k, (canalMap.get(k) ?? 0) + g._count._all); }

    return {
      total,
      porMes: meses.map((m, i) => ({ mes: m.mes, label: m.label, total: porMesCounts[i] })),
      porCanal: [...canalMap.entries()].map(([canal, qtd]) => ({ canal, total: qtd })).sort((a, b) => b.total - a.total),
      porStatus: porStatus.map((g) => ({ status: g.status, total: g._count._all })),
      rankingTenants: ranking.map((r) => ({ tenantId: r.tenantId, nome: nomes.get(r.tenantId) ?? '—', disparos: r._count._all })),
    };
  }
}
