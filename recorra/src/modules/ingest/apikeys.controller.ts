import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { ApiKeyService } from './api-key.service';
import { API_SCOPES } from '@/modules/public-api/scopes';

/** Gestão dos tokens de API do tenant (usados na API pública /api/v1/*). */
@Controller('config/api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeyService) {}

  /** Escopos que um token de tenant pode receber (sem os de plataforma). */
  @Get('scopes')
  scopes() {
    return API_SCOPES.filter((s) => !s.plataforma);
  }

  @Get()
  @Roles('OWNER', 'ADMIN')
  list(@TenantId() tenantId: string) {
    return this.keys.list(tenantId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(
    @TenantId() tenantId: string,
    @Body() body: { nome?: string; scopes?: string[]; expiraEm?: string | null },
  ) {
    return this.keys.create(tenantId, body.nome || 'Integração', { scopes: body.scopes, expiraEm: body.expiraEm });
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  revoke(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.keys.revoke(tenantId, id);
  }
}
