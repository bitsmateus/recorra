import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { RulesService } from './rules.service';
import { SaveRuleDto, SetDefaultRuleDto, SetRiskModeDto } from './dto/rule.dto';

@Controller('reguas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.rules.list(tenantId);
  }

  @Get('modelos')
  modelos() {
    return this.rules.listNichoTemplates();
  }

  /** Kanban de andamento: em que etapa da régua cada fatura em aberto está. */
  @Get('andamento')
  andamento(
    @TenantId() tenantId: string,
    @Query('ruleId') ruleId?: string,
    @Query('pausadas') pausadas?: string,
  ) {
    return this.rules.andamento(tenantId, ruleId, pausadas === '1');
  }

  /** Pausa/retoma a cobrança de faturas selecionadas na Esteira. */
  @Post('andamento/pausar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  pausar(@TenantId() tenantId: string, @Body('invoiceIds') invoiceIds?: string[], @Body('pausar') pausar?: boolean) {
    return this.rules.pausarCobranca(tenantId, invoiceIds ?? [], pausar !== false);
  }

  /** Dispara agora a etapa atual da régua para as faturas selecionadas. */
  @Post('andamento/disparar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  disparar(@TenantId() tenantId: string, @Body('invoiceIds') invoiceIds?: string[]) {
    return this.rules.dispararLote(tenantId, invoiceIds ?? []);
  }

  @Get('ab/stats')
  abStats(@TenantId() tenantId: string) {
    return this.rules.abStats(tenantId);
  }

  // Config da cobrança automática (modo faixa on/off + diagnóstico). Antes de :id.
  @Get('config')
  config(@TenantId() tenantId: string) {
    return this.rules.config(tenantId);
  }

  @Post('config/faixa')
  @Roles('OWNER', 'ADMIN')
  setFaixa(@TenantId() tenantId: string, @Body() dto: SetRiskModeDto) {
    return this.rules.setUsarFaixaRisco(tenantId, dto.usarFaixaRisco);
  }

  @Post('config/regua-padrao')
  @Roles('OWNER', 'ADMIN')
  setReguaPadrao(@TenantId() tenantId: string, @Body() dto: SetDefaultRuleDto) {
    return this.rules.setReguaPadrao(tenantId, dto.ruleId);
  }

  @Post('modelos/:id/clonar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  clonar(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.rules.cloneNicho(tenantId, id);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.rules.get(tenantId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  create(@TenantId() tenantId: string, @Body() dto: SaveRuleDto) {
    return this.rules.create(tenantId, dto);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: SaveRuleDto) {
    return this.rules.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.rules.remove(tenantId, id);
  }
}
