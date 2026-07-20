import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { SettingsService } from './settings.service';
import { CreateIntegrationDto, UpdateIntegrationDto, CreatePaymentAccountDto, CreateChannelAccountDto } from './dto/settings.dto';

@Controller('config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Integrações (ERP)
  @Get('integracoes')
  listIntegrations(@TenantId() tenantId: string) {
    return this.settings.listIntegrations(tenantId);
  }

  @Post('integracoes')
  @Roles('OWNER', 'ADMIN')
  createIntegration(@TenantId() tenantId: string, @Body() dto: CreateIntegrationDto) {
    return this.settings.createIntegration(tenantId, dto);
  }

  @Patch('integracoes/:id')
  @Roles('OWNER', 'ADMIN')
  updateIntegration(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateIntegrationDto) {
    return this.settings.updateIntegration(tenantId, id, dto);
  }

  @Post('integracoes/:id/testar')
  @Roles('OWNER', 'ADMIN')
  testIntegration(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.settings.testIntegration(tenantId, id);
  }

  @Delete('integracoes/:id')
  @Roles('OWNER', 'ADMIN')
  removeIntegration(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.settings.removeIntegration(tenantId, id);
  }

  // Gateways
  @Get('gateways')
  listGateways(@TenantId() tenantId: string) {
    return this.settings.listPaymentAccounts(tenantId);
  }

  @Post('gateways')
  @Roles('OWNER', 'ADMIN')
  createGateway(@TenantId() tenantId: string, @Body() dto: CreatePaymentAccountDto) {
    return this.settings.createPaymentAccount(tenantId, dto);
  }

  // Canais
  @Get('canais')
  listChannels(@TenantId() tenantId: string) {
    return this.settings.listChannelAccounts(tenantId);
  }

  @Post('canais')
  @Roles('OWNER', 'ADMIN')
  createChannel(@TenantId() tenantId: string, @Body() dto: CreateChannelAccountDto) {
    return this.settings.createChannelAccount(tenantId, dto);
  }

  // Réguas
  @Get('reguas')
  listRules(@TenantId() tenantId: string) {
    return this.settings.listRules(tenantId);
  }
}
