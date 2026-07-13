import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { env } from '@/config/env';

export interface PlatformPayload {
  sub: string;
  email: string;
  scope: 'platform';
}

/** Protege rotas do superadmin. Exige JWT com scope: 'platform'. */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Token ausente');
    try {
      const payload = await this.jwt.verifyAsync<PlatformPayload>(header.slice(7), { secret: env.JWT_SECRET });
      if (payload.scope !== 'platform') throw new Error('escopo inválido');
      (req as Request & { admin: unknown }).admin = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Acesso de plataforma inválido');
    }
  }
}
