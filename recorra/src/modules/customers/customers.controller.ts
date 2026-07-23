import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RiskBand } from '@prisma/client';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { RiskScoringService } from '@/modules/risk/risk-scoring.service';
import { CustomersService } from './customers.service';
import { UpsertCustomerDto } from './dto/customer.dto';
import { parseNumberFilter } from '@/common/util/parse';

@Controller('clientes')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly risk: RiskScoringService,
  ) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('q') q?: string,
    @Query('tags') tags?: string,
    @Query('plano') plano?: string,
    @Query('uf') uf?: string,
    @Query('valorMin') valorMin?: string,
    @Query('valorMax') valorMax?: string,
    @Query('faixa') faixa?: RiskBand,
    @Query('etiqueta') etiqueta?: string,
    @Query('aba') aba?: 'geral' | 'aberto' | 'incompleto',
    @Query('falta') falta?: 'telefone' | 'email' | 'ambos',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.customers.segment(tenantId, {
      q,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      plano,
      uf,
      valorMin: parseNumberFilter(valorMin),
      valorMax: parseNumberFilter(valorMax),
      faixa,
      etiqueta,
      aba,
      falta,
      page,
      pageSize,
    });
  }

  @Get('etiquetas')
  etiquetas(@TenantId() tenantId: string) {
    return this.customers.listEtiquetas(tenantId);
  }

  @Post('etiquetas')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  criarEtiqueta(@TenantId() tenantId: string, @Body('nome') nome: string, @Body('cor') cor?: string) {
    return this.customers.criarEtiqueta(tenantId, nome, cor);
  }

  @Delete('etiquetas/:nome')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  excluirEtiqueta(@TenantId() tenantId: string, @Param('nome') nome: string) {
    return this.customers.excluirEtiqueta(tenantId, nome);
  }

  @Get('tags')
  tags(@TenantId() tenantId: string) {
    return this.customers.listTags(tenantId);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.customers.getOrThrow(tenantId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  create(@TenantId() tenantId: string, @Body() dto: UpsertCustomerDto) {
    return this.customers.create(tenantId, dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpsertCustomerDto) {
    return this.customers.update(tenantId, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.customers.remove(tenantId, id);
  }

  @Post('excluir-lote')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  removeMany(@TenantId() tenantId: string, @Body('ids') ids?: string[]) {
    return this.customers.removeMany(tenantId, ids ?? []);
  }

  @Patch(':id/tags')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  setTags(@TenantId() tenantId: string, @Param('id') id: string, @Body('tags') tags: string[]) {
    return this.customers.setTags(tenantId, id, tags ?? []);
  }

  @Get(":id/detalhe")
  detalhe(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.customers.getDetalhe(tenantId, id);
  }

  @Get(':id/risco')
  risco(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.risk.latest(tenantId, id);
  }

  @Post(':id/risco/recalcular')
  recalcular(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.risk.evaluate(tenantId, id);
  }

  @Post('risco/recalcular-todos')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  recalcularTodos(@TenantId() tenantId: string) {
    return this.risk.evaluateAll(tenantId);
  }
}
