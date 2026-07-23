import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { PlanTier, UserRole } from '@prisma/client';
import { PlatformService, PlanoInput } from './platform.service';
import { PlatformGuard, PlatformPayload } from './platform.guard';
import { BillingSaasService } from './billing-saas.service';
import { PlatformAsaasService } from './platform-asaas.service';

@Controller('admin')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly billing: BillingSaasService,
    private readonly asaas: PlatformAsaasService,
  ) {}

  // Rate limit estrito: o superadmin controla todos os tenants (alvo de brute force).
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  login(@Body('email') email: string, @Body('senha') senha: string, @Body('codigo') codigo?: string) {
    return this.platform.login(email, senha, codigo);
  }

  @Post('2fa/setup')
  @UseGuards(PlatformGuard)
  setup2fa(@Req() req: Request & { admin: PlatformPayload }) {
    return this.platform.setup2fa(req.admin.sub);
  }

  @Post('2fa/enable')
  @UseGuards(PlatformGuard)
  enable2fa(@Req() req: Request & { admin: PlatformPayload }, @Body('codigo') codigo: string) {
    return this.platform.enable2fa(req.admin.sub, codigo);
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

  // ---- Relatórios (tendências, implementações, disparos, ranking) ----
  @Get('relatorios/financeiro')
  @UseGuards(PlatformGuard)
  relatorioFinanceiro() {
    return this.platform.relatorioFinanceiro();
  }

  @Get('relatorios/disparos')
  @UseGuards(PlatformGuard)
  relatorioDisparos() {
    return this.platform.relatorioDisparos();
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

  // ---- Cobrança da plataforma via Asaas ----
  @Get('asaas/config')
  @UseGuards(PlatformGuard)
  asaasConfig() {
    return this.asaas.getConfig();
  }

  @Put('asaas/config')
  @UseGuards(PlatformGuard)
  asaasSalvar(@Body() body: { ambiente?: string; apiKey?: string; webhookToken?: string }) {
    return this.asaas.saveConfig(body);
  }

  @Post('faturas/:id/cobrar')
  @UseGuards(PlatformGuard)
  cobrarFatura(@Param('id') id: string) {
    return this.asaas.cobrar(id);
  }

  @Post('faturas/:id/sincronizar')
  @UseGuards(PlatformGuard)
  sincronizarFatura(@Param('id') id: string) {
    return this.asaas.sincronizar(id);
  }

  // ---- Planos (catálogo editável) ----
  @Get('planos')
  @UseGuards(PlatformGuard)
  planos() {
    return this.platform.listPlanos();
  }

  @Post('planos')
  @UseGuards(PlatformGuard)
  criarPlano(@Body() body: PlanoInput) {
    return this.platform.createPlano(body);
  }

  @Put('planos/:id')
  @UseGuards(PlatformGuard)
  editarPlano(@Param('id') id: string, @Body() body: PlanoInput) {
    return this.platform.updatePlano(id, body);
  }

  @Delete('planos/:id')
  @UseGuards(PlatformGuard)
  excluirPlano(@Param('id') id: string) {
    return this.platform.deletePlano(id);
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
  updateTenant(@Param('id') id: string, @Body() body: { nome?: string; cnpj?: string; ativo?: boolean; plano?: PlanTier; planId?: string | null }) {
    return this.platform.updateTenant(id, body);
  }

  /** Prévia do que a exclusão vai apagar (mostrada na confirmação). */
  @Get('tenants/:id/exclusao')
  @UseGuards(PlatformGuard)
  tenantDeletePreview(@Param('id') id: string) {
    return this.platform.tenantDeletePreview(id);
  }

  /** Exclui o tenant e todos os dados. Exige o nome exato da empresa no corpo. */
  @Delete('tenants/:id')
  @UseGuards(PlatformGuard)
  deleteTenant(@Param('id') id: string, @Body('confirmacao') confirmacao: string) {
    return this.platform.deleteTenant(id, confirmacao);
  }

  // ---- Usuários do tenant ----

  @Get('tenants/:id/usuarios')
  @UseGuards(PlatformGuard)
  listTenantUsers(@Param('id') id: string) {
    return this.platform.listTenantUsers(id);
  }

  @Post('tenants/:id/usuarios')
  @UseGuards(PlatformGuard)
  createTenantUser(@Param('id') id: string, @Body() body: { nome: string; email: string; senha: string; role?: UserRole }) {
    return this.platform.createTenantUser(id, body);
  }

  @Patch('tenants/:id/usuarios/:userId')
  @UseGuards(PlatformGuard)
  updateTenantUser(@Param('id') id: string, @Param('userId') userId: string, @Body() body: { nome?: string; email?: string; role?: UserRole; ativo?: boolean }) {
    return this.platform.updateTenantUser(id, userId, body);
  }

  @Post('tenants/:id/usuarios/:userId/senha')
  @UseGuards(PlatformGuard)
  resetTenantUserSenha(@Param('id') id: string, @Param('userId') userId: string, @Body('senha') senha: string) {
    return this.platform.resetTenantUserSenha(id, userId, senha);
  }

  @Delete('tenants/:id/usuarios/:userId')
  @UseGuards(PlatformGuard)
  deleteTenantUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.platform.deleteTenantUser(id, userId);
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
