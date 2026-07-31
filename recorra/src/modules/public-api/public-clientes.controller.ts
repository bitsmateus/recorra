import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomersService } from '@/modules/customers/customers.service';
import { UpsertCustomerDto } from '@/modules/customers/dto/customer.dto';
import { PublicApiGuard } from './public-api.guard';
import { ApiTenant } from './api-tenant.decorator';
import { Scopes } from '@/common/auth/scopes.decorator';

/** API pública de Clientes (token de tenant). Base: /api/v1/clientes */
@Controller('v1/clientes')
@UseGuards(PublicApiGuard)
export class PublicClientesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
  ) {}

  @Get()
  @Scopes('clientes:read')
  async list(@ApiTenant() tenantId: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('q') q?: string) {
    const take = Math.min(200, Math.max(1, Number(pageSize) || 50));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;
    const termo = q?.trim();
    const where = {
      tenantId,
      ...(termo ? { OR: [{ nome: { contains: termo, mode: 'insensitive' as const } }, { doc: { contains: termo.replace(/\D/g, '') } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: { nome: 'asc' }, take, skip, select: { id: true, nome: true, doc: true, email: true, telefone: true, contrato: true, plano: true, cidade: true, uf: true, ativo: true, faixaAtual: true, createdAt: true } }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page: Math.max(1, Number(page) || 1), pageSize: take };
  }

  @Get(':id')
  @Scopes('clientes:read')
  get(@ApiTenant() tenantId: string, @Param('id') id: string) {
    return this.customers.getOrThrow(tenantId, id);
  }

  @Post()
  @Scopes('clientes:write')
  create(@ApiTenant() tenantId: string, @Body() dto: UpsertCustomerDto) {
    return this.customers.create(tenantId, dto);
  }

  @Put(':id')
  @Scopes('clientes:write')
  update(@ApiTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpsertCustomerDto) {
    return this.customers.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Scopes('clientes:write')
  remove(@ApiTenant() tenantId: string, @Param('id') id: string) {
    return this.customers.remove(tenantId, id);
  }
}
