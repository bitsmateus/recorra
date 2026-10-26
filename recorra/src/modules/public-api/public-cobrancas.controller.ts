import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ChargeMethod } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ChargesService } from '@/modules/payments/charges.service';
import { PublicApiGuard } from './public-api.guard';
import { ApiTenant } from './api-tenant.decorator';
import { Scopes } from '@/common/auth/scopes.decorator';

/** CPF/CNPJ pode estar gravado so com digitos ou com mascara: aceita as duas formas. */
function variantesDoc(d: string): string[] {
  const v = [d];
  if (d.length === 11) v.push(d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'));
  if (d.length === 14) v.push(d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'));
  return v;
}

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
  async list(
    @ApiTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('doc') doc?: string,
    @Query('customerId') customerId?: string,
  ) {
    const take = Math.min(200, Math.max(1, Number(pageSize) || 50));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;
    // status aceita lista separada por virgula (ex.: PENDENTE,VENCIDA); doc = CPF/CNPJ do cliente (com ou sem mascara)
    const statusLista = (status || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const docLimpo = (doc || '').replace(/\D/g, '');
    const where = {
      tenantId,
      ...(statusLista.length === 1 ? { status: statusLista[0] as never } : {}),
      ...(statusLista.length > 1 ? { status: { in: statusLista as never[] } } : {}),
      ...(customerId ? { customerId } : {}),
      ...(docLimpo ? { customer: { doc: { in: variantesDoc(docLimpo) } } } : {}),
    };
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
