import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from '@/modules/users/users.service';
import { PublicApiGuard } from './public-api.guard';
import { ApiTenant } from './api-tenant.decorator';
import { Scopes } from '@/common/auth/scopes.decorator';

/**
 * Papéis que um token de API pode conceder. OWNER e ADMIN ficam de fora: senão um
 * token com um único escopo (`usuarios:write`) viraria controle total do tenant,
 * contornando o modelo de escopos que o próprio token deveria respeitar.
 */
const PAPEIS_VIA_API: UserRole[] = ['FINANCEIRO', 'OPERADOR', 'LEITURA'];

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
    // O token age como ADMIN, não como OWNER: um token restrito a `usuarios:write`
    // não pode fabricar um OWNER e, por ele, obter todo o resto do tenant. Papéis
    // administrativos continuam sendo concedidos só pelo painel, com login humano.
    const role = body.role && PAPEIS_VIA_API.includes(body.role) ? body.role : 'OPERADOR';
    return this.users.criar(tenantId, 'ADMIN', { nome: body.nome, email: body.email, senha: body.senha, role });
  }
}
