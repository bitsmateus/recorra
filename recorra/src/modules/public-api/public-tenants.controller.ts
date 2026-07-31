import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PlanTier } from '@prisma/client';
import { PlatformService } from '@/modules/platform/platform.service';
import { PublicApiGuard } from './public-api.guard';
import { Scopes } from '@/common/auth/scopes.decorator';

/** API pública de Tenants (token de PLATAFORMA/superadmin). Base: /api/v1/tenants */
@Controller('v1/tenants')
@UseGuards(PublicApiGuard)
export class PublicTenantsController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  @Scopes('tenants:read')
  list() {
    return this.platform.listTenants();
  }

  @Post()
  @Scopes('tenants:write')
  create(@Body() body: { empresa: string; cnpj?: string; nome: string; email: string; senha: string; plano?: PlanTier }) {
    return this.platform.createTenant(body);
  }
}
