import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlanTier } from '@prisma/client';
import { PlatformService } from './platform.service';
import { PlatformGuard } from './platform.guard';
import { BillingSaasService } from './billing-saas.service';

@Controller('admin')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly billing: BillingSaasService,
  ) {}

  @Post('login')
  login(@Body('email') email: string, @Body('senha') senha: string) {
    return this.platform.login(email, senha);
  }

  @Get('metrics')
  @UseGuards(PlatformGuard)
  metrics() {
    return this.platform.metrics();
  }

  // ---- Financeiro ----
  @Get('financeiro')
  @UseGuards(PlatformGuard)
  financeiro() {
    return this.platform.financeiro();
  }

  @Get('faturas')
  @UseGuards(PlatformGuard)
  faturas(@Query('status') status?: string) {
    return this.platform.listAllInvoices(status);
  }

  @Patch('faturas/:id/pagar')
  @UseGuards(PlatformGuard)
  pagarFatura(@Param('id') id: string, @Body('paga') paga: boolean) {
    return this.platform.marcarFaturaPaga(id, paga ?? true);
  }

  // ---- Planos ----
  @Get('planos')
  @UseGuards(PlatformGuard)
  planos() {
    return this.platform.listPlanos();
  }

  // ---- Admins da plataforma ----
  @Get('admins')
  @UseGuards(PlatformGuard)
  listAdmins() {
    return this.platform.listAdmins();
  }

  @Post('admins')
  @UseGuards(PlatformGuard)
  createAdmin(@Body() body: { nome: string; email: string; senha: string }) {
    return this.platform.createAdmin(body);
  }

  // ---- Tenants ----
  @Get('tenants')
  @UseGuards(PlatformGuard)
  listTenants() {
    return this.platform.listTenants();
  }

  @Get('tenants/:id/detalhe')
  @UseGuards(PlatformGuard)
  tenantDetail(@Param('id') id: string) {
    return this.platform.tenantDetail(id);
  }

  @Post('tenants')
  @UseGuards(PlatformGuard)
  createTenant(@Body() body: { empresa: string; cnpj?: string; nome: string; email: string; senha: string; plano?: PlanTier }) {
    return this.platform.createTenant(body);
  }

  @Patch('tenants/:id')
  @UseGuards(PlatformGuard)
  updateTenant(@Param('id') id: string, @Body() body: { nome?: string; cnpj?: string; ativo?: boolean; plano?: PlanTier }) {
    return this.platform.updateTenant(id, body);
  }

  @Get('tenants/:id/saude')
  @UseGuards(PlatformGuard)
  health(@Param('id') id: string) {
    return this.platform.tenantHealth(id);
  }

  @Patch('tenants/:id/flags')
  @UseGuards(PlatformGuard)
  flags(@Param('id') id: string, @Body('flags') flags: Record<string, boolean>) {
    return this.platform.setFeatureFlags(id, flags ?? {});
  }

  @Get('tenants/:id/faturas')
  @UseGuards(PlatformGuard)
  tenantInvoices(@Param('id') id: string) {
    return this.billing.listInvoices(id);
  }

  @Post('tenants/:id/faturas/gerar')
  @UseGuards(PlatformGuard)
  gerarFatura(@Param('id') id: string, @Body('competencia') competencia?: string) {
    return this.billing.gerarFatura(id, competencia);
  }

  @Post('faturas/fechar-mes')
  @UseGuards(PlatformGuard)
  fecharMes(@Body('competencia') competencia?: string) {
    return this.billing.gerarTodas(competencia);
  }
}
