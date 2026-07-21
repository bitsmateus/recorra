import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MailService } from '@/common/mail/mail.service';
import { env } from '@/config/env';
import { JwtPayload } from '@/common/auth/jwt.types';
import { randomToken, hashToken, expiresInMinutes, expiresInDays, isExpired } from '@/common/auth/tokens';
import { generateTotpSecret, totpAuthUrl, verifyTotp } from '@/common/auth/totp';
import { verifyGoogleIdToken } from '@/common/auth/google';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  // ---------------- Registro ----------------

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const senhaHash = await argon2.hash(dto.senha, { type: argon2.argon2id });
    const verify = randomToken();

    const tenant = await this.prisma.tenant.create({
      data: {
        nome: dto.empresa,
        cnpj: dto.cnpj,
        users: {
          create: {
            nome: dto.nome,
            email: dto.email,
            senhaHash,
            role: 'OWNER',
            verifyToken: hashToken(verify),
            verifyTokenExp: expiresInMinutes(60 * 24),
          },
        },
      },
      include: { users: true },
    });

    const user = tenant.users[0];
    await this.mail.sendVerification(user.email, verify);

    const tokens = await this.issueTokens({ sub: user.id, tenantId: tenant.id, role: user.role, email: user.email });
    return { ...tokens, emailVerify: false };
  }

  // ---------------- Login ----------------

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({ where: { email: dto.email, ativo: true } });
    if (!user || !user.senhaHash) throw new UnauthorizedException('Credenciais inválidas');

    const ok = await argon2.verify(user.senhaHash, dto.senha);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    // 2FA
    if (user.twoFaEnabled && user.twoFaSecret) {
      if (!dto.codigo) throw new UnauthorizedException('2FA_REQUIRED');
      if (!verifyTotp(dto.codigo, user.twoFaSecret)) throw new UnauthorizedException('Código 2FA inválido');
    }

    return this.issueTokens({ sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
  }

  // ---------------- Google SSO ----------------

  async loginGoogle(idToken: string, codigo?: string) {
    const profile = await verifyGoogleIdToken(idToken).catch(() => null);
    if (!profile || !profile.emailVerified) throw new UnauthorizedException('Token Google inválido');

    let user = await this.prisma.user.findFirst({ where: { email: profile.email, ativo: true } });

    // 2FA também no SSO: se o usuário existente tem 2FA ativo, o Google não pode
    // pular o segundo fator (senão o 2FA valeria só no login por senha).
    if (user?.twoFaEnabled && user.twoFaSecret) {
      if (!codigo) throw new UnauthorizedException('2FA_REQUIRED');
      if (!verifyTotp(codigo, user.twoFaSecret)) throw new UnauthorizedException('Código 2FA inválido');
    }

    // Se não existe, cria um novo tenant com este usuário como OWNER (cadastro via Google).
    if (!user) {
      const tenant = await this.prisma.tenant.create({
        data: {
          nome: profile.name ?? profile.email,
          users: {
            create: {
              nome: profile.name ?? profile.email,
              email: profile.email,
              role: 'OWNER',
              provider: 'google',
              providerId: profile.sub,
              emailVerify: true,
            },
          },
        },
        include: { users: true },
      });
      user = tenant.users[0];
    }

    return this.issueTokens({ sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
  }

  // ---------------- Verificação de e-mail ----------------

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email: email.trim().toLowerCase() } });
    // Sempre responde ok (não revela se o e-mail existe).
    if (user && user.ativo) {
      const token = randomToken();
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetToken: hashToken(token), resetTokenExp: expiresInMinutes(60) },
      });
      await this.mail.sendPasswordReset(user.email, token).catch(() => undefined);
    }
    return { ok: true };
  }

  async resetPassword(token: string, novaSenha: string) {
    if (!token || !novaSenha || novaSenha.length < 6) throw new BadRequestException('Dados inválidos (senha mínima de 6 caracteres).');
    const user = await this.prisma.user.findFirst({ where: { resetToken: hashToken(token) } });
    if (!user || !user.resetTokenExp || isExpired(user.resetTokenExp)) {
      throw new BadRequestException('Link inválido ou expirado. Solicite um novo.');
    }
    const senhaHash = await argon2.hash(novaSenha, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { senhaHash, resetToken: null, resetTokenExp: null },
    });
    // Revoga sessões antigas por segurança.
    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    return { ok: true };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({ where: { verifyToken: hashToken(token) } });
    if (!user || isExpired(user.verifyTokenExp)) throw new BadRequestException('Token inválido ou expirado');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerify: true, verifyToken: null, verifyTokenExp: null },
    });
    return { ok: true };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerify) return { ok: true };
    const verify = randomToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { verifyToken: hashToken(verify), verifyTokenExp: expiresInMinutes(60 * 24) },
    });
    await this.mail.sendVerification(user.email, verify);
    return { ok: true };
  }

  // ---------------- Refresh tokens (rotação) ----------------

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, { secret: env.JWT_SECRET });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
    // Um token de acesso não pode ser trocado por uma sessão nova.
    if (payload.kind === 'access') throw new UnauthorizedException('Refresh token inválido');

    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (!stored || isExpired(stored.expiraEm)) {
      throw new UnauthorizedException('Sessão expirada');
    }

    // Rotação atômica: só UM request transiciona revogado false→true. Fecha a
    // corrida em que dois refreshes concorrentes com o mesmo token passariam.
    const claim = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revogado: false },
      data: { revogado: true },
    });
    if (claim.count === 0) throw new UnauthorizedException('Sessão expirada');

    // Re-lê o usuário do banco: role/tenant/ativo ATUAIS, nunca os do token.
    // Sem isso, desativar ou rebaixar um usuário não teria efeito enquanto ele
    // renovasse a sessão (o token carregava o estado antigo indefinidamente).
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.ativo) throw new UnauthorizedException('Sessão expirada');

    return this.issueTokens({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken) },
      data: { revogado: true },
    });
    return { ok: true };
  }

  // ---------------- 2FA (TOTP) ----------------

  async setup2fa(userId: string, email: string) {
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { twoFaSecret: secret, twoFaEnabled: false } });
    return { secret, otpauthUrl: totpAuthUrl(email, secret) };
  }

  async enable2fa(userId: string, codigo: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFaSecret) throw new BadRequestException('Configure o 2FA primeiro');
    if (!verifyTotp(codigo, user.twoFaSecret)) throw new BadRequestException('Código inválido');
    await this.prisma.user.update({ where: { id: userId }, data: { twoFaEnabled: true } });
    return { ok: true };
  }

  async disable2fa(userId: string, codigo: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.twoFaSecret && !verifyTotp(codigo, user.twoFaSecret)) {
      throw new BadRequestException('Código inválido');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFaEnabled: false, twoFaSecret: null },
    });
    return { ok: true };
  }

  // ---------------- Emissão de tokens ----------------

  private async issueTokens(payload: JwtPayload) {
    // Base sem `kind` — cada token recebe o seu, para que o refresh não sirva
    // como bearer de acesso (ver JwtAuthGuard).
    const base: JwtPayload = {
      sub: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ ...base, kind: 'access' }, { secret: env.JWT_SECRET, expiresIn: env.JWT_ACCESS_TTL }),
      this.jwt.signAsync({ ...base, kind: 'refresh' }, { secret: env.JWT_SECRET, expiresIn: env.JWT_REFRESH_TTL }),
    ]);
    // guarda o hash do refresh para permitir rotação/revogação
    await this.prisma.refreshToken.create({
      data: { userId: payload.sub, tokenHash: hashToken(refreshToken), expiraEm: expiresInDays(30) },
    });
    return { accessToken, refreshToken };
  }
}
