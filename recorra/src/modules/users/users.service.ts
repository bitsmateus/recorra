import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MailService } from '@/common/mail/mail.service';
import { AuditService } from '@/common/audit/audit.service';
import { AuthUser } from '@/common/auth/jwt.types';
import { randomToken, hashToken, expiresInDays, isExpired } from '@/common/auth/tokens';

/** Gestão de usuários do tenant: convite por e-mail, aceite, listagem, papéis. */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  list(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, nome: true, email: true, role: true, ativo: true, convidado: true, emailVerify: true, twoFaEnabled: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Convida um usuário: cria registro pendente + envia e-mail com token. */
  async invite(tenantId: string, actorRole: UserRole, dto: { nome: string; email: string; role: UserRole }) {
    // Só um OWNER pode criar outro OWNER (evita escalada ADMIN → OWNER).
    if (dto.role === 'OWNER' && actorRole !== 'OWNER') {
      throw new ForbiddenException('Apenas um OWNER pode conceder o papel OWNER');
    }
    const existing = await this.prisma.user.findFirst({ where: { tenantId, email: dto.email } });
    if (existing) throw new ConflictException('Já existe um usuário com esse e-mail');

    const token = randomToken();
    await this.prisma.user.create({
      data: {
        tenantId,
        nome: dto.nome,
        email: dto.email,
        role: dto.role,
        convidado: true,
        ativo: true,
        inviteToken: hashToken(token),
        inviteTokenExp: expiresInDays(7),
      },
    });

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    await this.mail.sendInvite(dto.email, token, tenant.nome);
    return { ok: true };
  }

  /** Aceita o convite: define senha e ativa a conta. Rota pública. */
  async acceptInvite(dto: { token: string; senha: string }) {
    const user = await this.prisma.user.findFirst({ where: { inviteToken: hashToken(dto.token) } });
    if (!user || isExpired(user.inviteTokenExp)) throw new BadRequestException('Convite inválido ou expirado');

    const senhaHash = await argon2.hash(dto.senha, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { senhaHash, convidado: false, emailVerify: true, inviteToken: null, inviteTokenExp: null },
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
