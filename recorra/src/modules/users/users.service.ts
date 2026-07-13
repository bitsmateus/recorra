import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MailService } from '@/common/mail/mail.service';
import { randomToken, hashToken, expiresInDays, isExpired } from '@/common/auth/tokens';

/** Gestão de usuários do tenant: convite por e-mail, aceite, listagem, papéis. */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  list(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, nome: true, email: true, role: true, ativo: true, convidado: true, emailVerify: true, twoFaEnabled: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Convida um usuário: cria registro pendente + envia e-mail com token. */
  async invite(tenantId: string, dto: { nome: string; email: string; role: UserRole }) {
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

  async updateRole(tenantId: string, userId: string, role: UserRole) {
    await this.assertTenant(tenantId, userId);
    return this.prisma.user.update({ where: { id: userId }, data: { role }, select: { id: true, role: true } });
  }

  async setAtivo(tenantId: string, userId: string, ativo: boolean) {
    await this.assertTenant(tenantId, userId);
    return this.prisma.user.update({ where: { id: userId }, data: { ativo }, select: { id: true, ativo: true } });
  }

  private async assertTenant(tenantId: string, userId: string) {
    const u = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!u) throw new BadRequestException('Usuário não encontrado neste tenant');
  }
}
