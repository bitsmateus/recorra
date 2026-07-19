import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PlanTier } from '@prisma/client';
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
}
