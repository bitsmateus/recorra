import { Body, Controller, Get, Param, Post, Query, UseGuards, Delete, Put } from '@nestjs/common';
import { ChargeMethod } from '@prisma/client';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId, CurrentUser } from '@/common/auth/current-user.decorator';
import { AuthUser } from '@/common/auth/jwt.types';
import { ChargesService } from './charges.service';
import { ReconciliationService } from './reconciliation.service';
import { SplitRuleInput } from './payment-provider.interface';

@Controller('cobrancas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChargesController {
  constructor(
    private readonly charges: ChargesService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Post('conciliar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  conciliar(@TenantId() tenantId: string) {
    return this.reconciliation.reconcileTenant(tenantId);
  }

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('q') q?: string,
    @Query('metodo') metodo?: string,
    @Query('origem') origem?: string,
    @Query('geracao') geracao?: 'gerada' | 'pendente',
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('valorMin') valorMin?: string,
    @Query('valorMax') valorMax?: string,
    @Query('etiqueta') etiqueta?: string,
  ) {
    return this.charges.listInvoices(tenantId, { status, customerId, q, metodo, origem, geracao, de, ate, valorMin, valorMax, etiqueta });
  }

  @Put(':invoiceId')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  editar(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Body('valor') valor?: number,
    @Body('vencimento') vencimento?: string,
    @Body('descricao') descricao?: string,
    @Body('status') status?: string,
  ) {
    return this.charges.updateInvoice(tenantId, invoiceId, { valor, vencimento, descricao, status }, actor.id);
  }

  @Delete(':invoiceId')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  excluir(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Query('escopo') escopo?: 'recorra' | 'ambos' | 'gateway',
  ) {
    return this.charges.removeInvoice(tenantId, invoiceId, escopo ?? 'recorra', actor.id);
  }

  @Post(':invoiceId/gerar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  gerar(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Body('accountId') accountId: string,
    @Body('metodo') metodo: ChargeMethod = 'PIX',
    @Body('splits') splits?: SplitRuleInput[],
  ) {
    return this.charges.gerarCobranca(tenantId, invoiceId, accountId, metodo, splits, 'avulsa', actor.id);
  }

  @Post(':invoiceId/contestar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  contestar(@TenantId() tenantId: string, @Param('invoiceId') invoiceId: string, @Body('contestada') contestada: boolean) {
    return this.charges.setContestada(tenantId, invoiceId, contestada ?? true);
  }

  @Get('modelo-excel')
  modeloExcel() {
    return this.charges.modeloExcel();
  }

  @Post('fatura')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  criarFatura(
    @TenantId() tenantId: string,
    @Body('customerId') customerId: string,
    @Body('valor') valor: number,
    @Body('vencimento') vencimento: string,
    @Body('descricao') descricao?: string,
    @Body('accountId') accountId?: string,
    @Body('metodo') metodo?: ChargeMethod,
  ) {
    return this.charges.criarFatura(tenantId, { customerId, valor, vencimento, descricao, accountId, metodo });
  }

  @Post('importar-gateway')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  importarGateway(@TenantId() tenantId: string, @Body('accountId') accountId: string) {
    return this.charges.importarDoGateway(tenantId, accountId);
  }

  @Post('lote')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  lote(
    @TenantId() tenantId: string,
    @Body('accountId') accountId: string,
    @Body('metodo') metodo: ChargeMethod = 'PIX',
    @Body('invoiceIds') invoiceIds?: string[],
    @Body('splits') splits?: SplitRuleInput[],
  ) {
    return this.charges.gerarLote(tenantId, accountId, metodo, invoiceIds, splits);
  }
}
