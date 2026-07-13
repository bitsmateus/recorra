import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { UsersService } from './users.service';

@Controller('usuarios')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@TenantId() tenantId: string) {
    return this.users.list(tenantId);
  }

  @Post('convidar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  invite(@TenantId() tenantId: string, @Body() dto: { nome: string; email: string; role: UserRole }) {
    return this.users.invite(tenantId, dto);
  }

  /** Público: aceitar convite e definir senha. */
  @Post('aceitar-convite')
  accept(@Body() dto: { token: string; senha: string }) {
    return this.users.acceptInvite(dto);
  }

  @Patch(':id/papel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  role(@TenantId() tenantId: string, @Param('id') id: string, @Body('role') role: UserRole) {
    return this.users.updateRole(tenantId, id, role);
  }

  @Patch(':id/ativo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  ativo(@TenantId() tenantId: string, @Param('id') id: string, @Body('ativo') ativo: boolean) {
    return this.users.setAtivo(tenantId, id, ativo);
  }
}
