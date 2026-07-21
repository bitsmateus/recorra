import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { CampaignsService, CampaignInput, PublicoFiltros } from './campaigns.service';

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

  // Segmentos salvos — declarados ANTES de :id para 'segmentos' não cair no @Get(':id').
  @Get('segmentos')
  listarSegmentos(@TenantId() tenantId: string) {
    return this.campaigns.listarSegmentos(tenantId);
  }

  @Post('segmentos')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  criarSegmento(@TenantId() tenantId: string, @Body('nome') nome: string, @Body('filtros') filtros: PublicoFiltros) {
    return this.campaigns.criarSegmento(tenantId, nome, filtros);
  }

  @Delete('segmentos/:id')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  excluirSegmento(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.excluirSegmento(tenantId, id);
  }

  // Cobrança automática (o motor diário como campanha) — antes de :id.
  @Get('automatica')
  automatica(@TenantId() tenantId: string) {
    return this.campaigns.getAutomatica(tenantId);
  }

  @Post('automatica/status')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  statusAutomatica(@TenantId() tenantId: string, @Body('status') status: 'ATIVA' | 'PAUSADA') {
    return this.campaigns.setStatusAutomatica(tenantId, status);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.get(tenantId, id);
  }

  @Get(':id/publico')
  publico(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.previewPublico(tenantId, id);
  }

  @Get(':id/participantes')
  participantesCampanha(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.participantesCampanha(tenantId, id);
  }

  @Get(':id/relatorio')
  relatorio(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.relatorio(tenantId, id);
  }

  @Post('previa')
  previa(@TenantId() tenantId: string, @Body() dto: PublicoFiltros) {
    return this.campaigns.previaPublico(tenantId, dto);
  }

  /** "Ver participantes": quem recebe (com situação/valor/risco/motivo) e quem é pulado e por quê. */
  @Post('participantes')
  participantes(@TenantId() tenantId: string, @Body() dto: PublicoFiltros & { tipoEnvio?: string; canal?: any }) {
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
