import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { EmailTemplatesService, EmailTemplateInput } from './email-templates.service';
import { EmailMarca } from './email-layout';

@Controller('modelos-email')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailTemplatesController {
  constructor(private readonly modelos: EmailTemplatesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.modelos.list(tenantId);
  }

  /** Modelos da biblioteca ainda não importados por este tenant. */
  @Get('biblioteca')
  biblioteca(@TenantId() tenantId: string) {
    return this.modelos.disponiveis(tenantId);
  }

  @Post('importar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  importar(@TenantId() tenantId: string, @Body() dto: { ids?: string[] }) {
    return this.modelos.importar(tenantId, dto?.ids);
  }

  /** HTML real do e-mail (o mesmo do envio), com dados de exemplo. */
  @Post('previa')
  previa(@TenantId() tenantId: string, @Body() dto: { assunto?: string; corpo?: string }) {
    return this.modelos.previa(tenantId, dto);
  }

  /** Marca (nome/cor/logo/assinatura) aplicada aos e-mails do tenant. */
  @Get('marca')
  marca(@TenantId() tenantId: string) {
    return this.modelos.marca(tenantId);
  }

  @Put('marca')
  @Roles('OWNER', 'ADMIN')
  salvarMarca(@TenantId() tenantId: string, @Body() dto: EmailMarca) {
    return this.modelos.salvarMarca(tenantId, dto);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  criar(@TenantId() tenantId: string, @Body() dto: EmailTemplateInput) {
    return this.modelos.criar(tenantId, dto);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  atualizar(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: EmailTemplateInput) {
    return this.modelos.atualizar(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  remover(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.modelos.remover(tenantId, id);
  }
}
