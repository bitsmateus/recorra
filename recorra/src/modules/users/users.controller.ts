import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId, CurrentUser } from '@/common/auth/current-user.decorator';
import { AuthUser } from '@/common/auth/jwt.types';
import { UsersService } from './users.service';
import { CreateUserDto, SetPasswordDto } from './dto/users.dto';

@Controller('usuarios')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@TenantId() tenantId: string) {
    return this.users.list(tenantId);
  }

  /** Cria o usuário já com senha — quem administra passa as credenciais. */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  criar(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.criar(tenantId, actor.role, dto);
  }

  /** Define/troca a senha de um usuário do tenant. */
  @Patch(':id/senha')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  senha(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: SetPasswordDto) {
    return this.users.definirSenha(tenantId, actor, id, dto.senha);
  }

  @Patch(':id/papel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  role(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Param('id') id: string, @Body('role') role: UserRole) {
    return this.users.updateRole(tenantId, actor, id, role);
  }

  @Patch(':id/ativo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  ativo(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Param('id') id: string, @Body('ativo') ativo: boolean) {
    return this.users.setAtivo(tenantId, actor, id, ativo);
  }
}
