import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ChargeMethod } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ChargesService } from '@/modules/payments/charges.service';
import { PublicApiGuard } from './public-api.guard';
import { ApiTenant } from './api-tenant.decorator';
import { Scopes } from '@/common/auth/scopes.decorator';

/** API pública de Cobranças (token de tenant). Base: /api/v1/cobrancas */
@Controller('v1/cobrancas')
@UseGuards(PublicApiGuard)
export class PublicCobrancasController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly charges: ChargesService,
  ) {}

  @Get()
  @Scopes('cobrancas:read')
  async list(@ApiTenant() tenantId: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string) {
    const take = Math.min(200, Math.max(1, Number(pageSize) || 50));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;
    const where = { tenantId, ...(status ? { status: status as never } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where, orderBy: { vencimento: 'desc' }, take, skip,
        select: { id: true, customerId: true, valor: true, vencimento: true, status: true, metodo: true, descricao: true, pixCopiaCola: true, boletoUrl: true, linkPagamento: true, externalId: true, pagoEm: true, createdAt: true, customer: { select: { nome: true, doc: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total, page: Math.max(1, Number(page) || 1), pageSize: take };
  }

  @Get(':id')
  @Scopes('cobrancas:read')
  async get(@ApiTenant() tenantId: string, @Param('id') id: string) {
    return this.prisma.invoice.findFirst({ where: { id, tenantId }, include: { customer: { select: { nome: true, doc: true, email: true, telefone: true } } } });
  }

  @Post()
  @Scopes('cobrancas:write')
  create(
    @ApiTenant() tenantId: string,
    @Body() body: { customerId: string; valor: number; vencimento: string; descricao?: string; accountId?: string; metodo?: ChargeMethod },
  ) {
    return this.charges.criarFatura(tenantId, body);
  }

  /** Gera Pix/boleto para a cobrança num gateway. */
  @Post(':id/gerar')
  @Scopes('cobrancas:write')
  gerar(@ApiTenant() tenantId: string, @Param('id') id: string, @Body() body: { accountId: string; metodo?: ChargeMethod }) {
    return this.charges.gerarCobranca(tenantId, id, body.accountId, body.metodo ?? 'PIX');
  }
}
