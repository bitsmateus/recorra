import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { SyncService } from './sync.service';

@Controller('integracoes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConnectorsController {
  constructor(private readonly sync: SyncService) {}

  /**
   * Dispara a sincronização (clientes + faturas) em segundo plano e responde na
   * hora — um ERP grande leva minutos e estouraria o timeout do navegador.
   * A tela acompanha por `GET :id/sync-status`.
   */
  @Post(':id/sincronizar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  sincronizar(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.sync.iniciarSync(tenantId, id);
  }

  /** Progresso da sincronização (quantos clientes/faturas já entraram). */
  @Get(':id/sync-status')
  syncStatus(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.sync.syncStatus(tenantId, id);
  }
}
