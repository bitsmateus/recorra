import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/common/audit/audit.service';
import { AuthUser } from '@/common/auth/jwt.types';

/**
 * Gestão de usuários do tenant: criação com senha, listagem, papéis.
 *
 * Não há convite por e-mail: quem administra cria o usuário já com a senha e passa
 * as credenciais. O fluxo antigo dependia de um provedor de e-mail configurado e
 * apontava para uma página de aceite que nunca existiu no painel.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string) {
    const rows = await this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, nome: true, email: true, role: true, ativo: true, senhaHash: true, emailVerify: true, twoFaEnabled: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    // `semSenha` sai do próprio hash, não de uma flag que pode divergir: sem senha,
    // o usuário simplesmente não consegue entrar.
    return rows.map(({ senhaHash, ...u }) => ({ ...u, semSenha: !senhaHash }));
  }

  /** Cria o usuário já pronto para entrar: e-mail + senha definidos por quem administra. */
  async criar(tenantId: string, actorRole: UserRole, dto: { nome: string; email: string; senha: string; role: UserRole }) {
    // Só um OWNER pode criar outro OWNER (evita escalada ADMIN → OWNER).
    if (dto.role === 'OWNER' && actorRole !== 'OWNER') {
      throw new ForbiddenException('Apenas um OWNER pode conceder o papel OWNER');
    }
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({ where: { tenantId, email } });
    if (existing) throw new ConflictException('Já existe um usuário com esse e-mail');

    const senhaHash = await argon2.hash(dto.senha, { type: argon2.argon2id });
    const criado = await this.prisma.user.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        email,
        role: dto.role,
        senhaHash,
        // Sem convite: a conta nasce ativa e com o e-mail dado como verificado —
        // quem administra é quem informou o endereço.
        convidado: false,
        emailVerify: true,
        ativo: true,
      },
      select: { id: true, nome: true, email: true, role: true, ativo: true },
    });
    await this.audit.record({
      tenantId, userId: undefined, acao: 'user.create', entidade: 'User', entidadeId: criado.id,
      depois: { email: criado.email, role: criado.role }, // nunca a senha
    });
    return criado;
  }

  /** Define ou troca a senha de um usuário do tenant (destrava quem ficou sem senha). */
  async definirSenha(tenantId: string, actor: AuthUser, userId: string, senha: string) {
    const alvo = await this.assertTenant(tenantId, userId);
    // Mesma regra dos outros pontos: mexer num OWNER exige ser OWNER.
    if (alvo.role === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Apenas um OWNER pode trocar a senha de outro OWNER');
    }
    const senhaHash = await argon2.hash(senha, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: userId },
      data: { senhaHash, convidado: false, emailVerify: true, inviteToken: null, inviteTokenExp: null },
    });
    await this.audit.record({
      tenantId, userId: actor.id, acao: 'user.senha.definir', entidade: 'User', entidadeId: userId,
      depois: { email: alvo.email }, // nunca a senha
    });
    return { ok: true };
  }

  async updateRole(tenantId: string, actor: AuthUser, userId: string, role: UserRole) {
    const alvo = await this.assertTenant(tenantId, userId);
    // Não pode alterar o próprio papel (evita auto-promoção).
    if (userId === actor.id) throw new ForbiddenException('Você não pode alterar o próprio papel');
    // Só OWNER concede OWNER ou altera o papel de um OWNER existente.
    if ((role === 'OWNER' || alvo.role === 'OWNER') && actor.role !== 'OWNER') {
      throw new ForbiddenException('Apenas um OWNER pode conceder ou remover o papel OWNER');
    }
    // Não deixar o tenant sem nenhum OWNER ativo.
    if (alvo.role === 'OWNER' && role !== 'OWNER') await this.assertNaoUltimoOwner(tenantId, userId);
    const upd = await this.prisma.user.update({ where: { id: userId }, data: { role }, select: { id: true, role: true } });
    await this.audit.record({
      tenantId, userId: actor.id, acao: 'user.role.update', entidade: 'User', entidadeId: userId,
      antes: { role: alvo.role }, depois: { role },
    });
    return upd;
  }

  async setAtivo(tenantId: string, actor: AuthUser, userId: string, ativo: boolean) {
    const alvo = await this.assertTenant(tenantId, userId);
    if (userId === actor.id && !ativo) throw new ForbiddenException('Você não pode desativar a própria conta');
    if (alvo.role === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Apenas um OWNER pode desativar outro OWNER');
    }
    if (alvo.role === 'OWNER' && !ativo) await this.assertNaoUltimoOwner(tenantId, userId);
    const upd = await this.prisma.user.update({ where: { id: userId }, data: { ativo }, select: { id: true, ativo: true } });
    await this.audit.record({
      tenantId, userId: actor.id, acao: 'user.ativo.update', entidade: 'User', entidadeId: userId,
      antes: { ativo: alvo.ativo }, depois: { ativo },
    });
    return upd;
  }

  private async assertTenant(tenantId: string, userId: string) {
    const u = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!u) throw new BadRequestException('Usuário não encontrado neste tenant');
    return u;
  }

  /** Garante que não estamos removendo/rebaixando o último OWNER ativo do tenant. */
  private async assertNaoUltimoOwner(tenantId: string, excetoUserId: string) {
    const outros = await this.prisma.user.count({
      where: { tenantId, role: 'OWNER', ativo: true, id: { not: excetoUserId } },
    });
    if (outros === 0) throw new BadRequestException('O tenant precisa de ao menos um OWNER ativo');
  }
}
