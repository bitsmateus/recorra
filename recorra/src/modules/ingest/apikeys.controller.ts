import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { ApiKeyService } from './api-key.service';

/** Gestão das API keys do tenant (usadas na ingestão externa). */
@Controller('config/api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeyService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.keys.list(tenantId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@TenantId() tenantId: string, @Body('nome') nome: string) {
    return this.keys.create(tenantId, nome || 'Integração');
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  revoke(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.keys.revoke(tenantId, id);
  }
}
