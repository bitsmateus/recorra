import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { ConnectionsService } from './connections.service';

@Controller('canais')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.connections.list(tenantId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  criar(@TenantId() tenantId: string, @Body() dto: { canal: ChannelType; apelido: string; credentials?: Record<string, unknown> }) {
    return this.connections.criar(tenantId, dto);
  }

  @Get(':id/qrcode')
  qrcode(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.connections.qrcode(tenantId, id);
  }

  @Get(':id/status')
  status(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.connections.status(tenantId, id);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.connections.remove(tenantId, id);
  }
}
