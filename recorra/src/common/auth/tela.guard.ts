import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthUser } from './jwt.types';
import { Tela, telasEfetivas } from './telas';

export const TELA_KEY = 'tela';
/** Exige que o usuário tenha esta tela liberada (Equipe → Telas, ou o padrão do papel). */
export const RequerTela = (tela: Tela) => SetMetadata(TELA_KEY, tela);

/**
 * Confere a permissão de TELA no backend (não só no menu). Lê as telas do banco
 * a cada chamada: liberar/retirar vale na hora, sem novo login.
 */
@Injectable()
export class TelaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tela = this.reflector.getAllAndOverride<Tela | undefined>(TELA_KEY, [context.getHandler(), context.getClass()]);
    if (!tela) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException('Permissão insuficiente');
    const u = await this.prisma.user.findUnique({ where: { id: user.id }, select: { role: true, telas: true, telasCustom: true } });
    if (!u || !telasEfetivas(u).includes(tela)) throw new ForbiddenException('Você não tem acesso a esta tela');
    return true;
  }
}
