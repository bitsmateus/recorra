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

  // ---------- Meu perfil (o próprio usuário logado) — antes das rotas :id ----------

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@TenantId() tenantId: string, @CurrentUser() user: AuthUser) {
    return this.users.meuPerfil(tenantId, user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  editarMe(@TenantId() tenantId: string, @CurrentUser() user: AuthUser, @Body('nome') nome?: string) {
    return this.users.editarMeuPerfil(tenantId, user.id, nome);
  }

  /** Troca a própria senha (exige a atual). Encerra as sessões: entra de novo com a nova. */
  @Post('me/senha')
  @UseGuards(JwtAuthGuard)
  trocarMinhaSenha(@TenantId() tenantId: string, @CurrentUser() user: AuthUser, @Body('senhaAtual') senhaAtual?: string, @Body('novaSenha') novaSenha?: string) {
    return this.users.trocarMinhaSenha(tenantId, user.id, senhaAtual ?? '', novaSenha ?? '');
  }

  @Get('telas')
  @UseGuards(JwtAuthGuard)
  catalogoTelas() {
    return this.users.catalogoTelas();
  }

  /** Quais telas a pessoa vê (null = padrão do papel). */
  @Patch(':id/telas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  telas(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Param('id') id: string, @Body('telas') telas?: string[] | null) {
    return this.users.updateTelas(tenantId, actor, id, Array.isArray(telas) ? telas : null);
  }

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

  /** Carteira (equipe) do operador na esteira — null remove a restrição de faixa. */
  @Patch(':id/carteira')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  carteira(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Param('id') id: string, @Body('carteiraId') carteiraId: string | null) {
    return this.users.updateCarteira(tenantId, actor, id, carteiraId || null);
  }

  /** Vínculo com o NX (ID do usuário e fila pessoal) — itens de fila e chat do NX. */
  @Patch(':id/nx')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  nx(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Param('id') id: string, @Body('nxUserId') nxUserId?: unknown, @Body('nxQueueId') nxQueueId?: unknown) {
    return this.users.updateNx(tenantId, actor, id, nxUserId, nxQueueId);
  }

  @Patch(':id/ativo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  ativo(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Param('id') id: string, @Body('ativo') ativo: boolean) {
    return this.users.setAtivo(tenantId, actor, id, ativo);
  }
}
