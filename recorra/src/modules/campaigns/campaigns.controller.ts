import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { CampaignsService, CampaignInput } from './campaigns.service';

@Controller('campanhas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('tipoEnvio') tipoEnvio?: string,
    @Query('ruleId') ruleId?: string,
    @Query('agendamento') agendamento?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('etiqueta') etiqueta?: string,
    @Query('canal') canal?: string,
  ) {
    return this.campaigns.list(tenantId, { q, status, tipoEnvio, ruleId, agendamento, de, ate, etiqueta, canal });
  }

  @Post('rodar-agendadas')
  @Roles('OWNER', 'ADMIN')
  rodarAgendadas() {
    return this.campaigns.executarAgendadas();
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.get(tenantId, id);
  }

  @Get(':id/publico')
  publico(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.previewPublico(tenantId, id);
  }

  @Get(':id/relatorio')
  relatorio(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.relatorio(tenantId, id);
  }

  @Post('previa')
  previa(@TenantId() tenantId: string, @Body() dto: { filtroTodos?: boolean; filtroEtiqueta?: string; filtroValorMin?: number; filtroValorMax?: number; filtroFaixa?: any; filtroStatus?: string; incluirIds?: string[]; excluirIds?: string[] }) {
    return this.campaigns.previaPublico(tenantId, dto);
  }

  /** "Ver participantes": quem recebe (com situação/valor/risco/motivo) e quem é pulado e por quê. */
  @Post('participantes')
  participantes(@TenantId() tenantId: string, @Body() dto: { filtroTodos?: boolean; filtroEtiqueta?: string; filtroValorMin?: number; filtroValorMax?: number; filtroFaixa?: any; filtroStatus?: string; incluirIds?: string[]; excluirIds?: string[]; tipoEnvio?: string; canal?: any }) {
    return this.campaigns.participantesPreview(tenantId, dto);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  create(@TenantId() tenantId: string, @Body() dto: CampaignInput) {
    return this.campaigns.create(tenantId, dto);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: CampaignInput) {
    return this.campaigns.update(tenantId, id, dto);
  }

  @Post(':id/executar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  executar(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.executar(tenantId, id);
  }

  @Post(':id/status')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  setStatus(@TenantId() tenantId: string, @Param('id') id: string, @Body('status') status: 'ATIVA' | 'PAUSADA') {
    return this.campaigns.setStatus(tenantId, id, status);
  }

  @Post(':id/duplicar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  duplicar(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.duplicar(tenantId, id);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.remove(tenantId, id);
  }
}
