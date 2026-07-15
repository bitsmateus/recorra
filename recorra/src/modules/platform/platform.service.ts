import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PlanTier } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { env } from '@/config/env';
import { generateTotpSecret, totpAuthUrl, verifyTotp } from '@/common/auth/totp';
import { detectAnomalies } from './anomaly';
import { PLANS } from './plans';

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
    const tenants = await this.prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
    const out = [];
    for (const t of tenants) {
      const [clientes, faturas, disparos] = await Promise.all([
        this.prisma.customer.count({ where: { tenantId: t.id } }),
        this.prisma.invoice.count({ where: { tenantId: t.id } }),
        this.prisma.messageDispatch.count({ where: { tenantId: t.id } }),
      ]);
      out.push({ id: t.id, nome: t.nome, cnpj: t.cnpj, plano: t.plano, ativo: t.ativo, criadoEm: t.createdAt, uso: { clientes, faturas, disparos } });
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

  async updateTenant(id: string, patch: { nome?: string; cnpj?: string; ativo?: boolean; plano?: PlanTier }) {
    return this.prisma.tenant.update({
      where: { id },
      data: { nome: patch.nome, cnpj: patch.cnpj, ativo: patch.ativo, plano: patch.plano },
      select: { id: true, nome: true, cnpj: true, ativo: true, plano: true },
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
    // MRR estimado: soma da mensalidade base dos planos dos tenants ativos
    const tenantsAtivos = await this.prisma.tenant.groupBy({ by: ['plano'], _count: true, where: { ativo: true } });
    const mrr = tenantsAtivos.reduce((s, g) => s + (PLANS[g.plano as keyof typeof PLANS]?.preco ?? 0) * g._count, 0);
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

  // ---------------- Planos (catalogo) ----------------

  listPlanos() {
    return Object.values(PLANS);
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
