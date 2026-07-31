import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from '@/modules/users/users.service';
import { PublicApiGuard } from './public-api.guard';
import { ApiTenant } from './api-tenant.decorator';
import { Scopes } from '@/common/auth/scopes.decorator';

/** API pública de Usuários do tenant. Base: /api/v1/usuarios */
@Controller('v1/usuarios')
@UseGuards(PublicApiGuard)
export class PublicUsuariosController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Scopes('usuarios:read')
  list(@ApiTenant() tenantId: string) {
    return this.users.list(tenantId);
  }

  @Post()
  @Scopes('usuarios:write')
  create(@ApiTenant() tenantId: string, @Body() body: { nome: string; email: string; senha: string; role?: UserRole }) {
    // O token tem autoridade administrativa no tenant (criado por OWNER/ADMIN).
    return this.users.criar(tenantId, 'OWNER', { nome: body.nome, email: body.email, senha: body.senha, role: body.role ?? 'OPERADOR' });
  }
}
