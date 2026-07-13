import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { SyncService } from './sync.service';

@Controller('integracoes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConnectorsController {
  constructor(private readonly sync: SyncService) {}

  /** Dispara a sincronização (clientes + faturas) de uma integração. */
  @Post(':id/sincronizar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  sincronizar(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.sync.syncAll(tenantId, id);
  }
}
