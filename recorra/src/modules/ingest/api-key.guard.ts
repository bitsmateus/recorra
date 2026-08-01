import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiKeyService } from './api-key.service';
import { SCOPES_KEY } from '@/common/auth/scopes.decorator';

/**
 * Autentica requisições de ingestão externa pelo header `x-api-key`.
 * Injeta `req.apiTenantId` com o tenant resolvido.
 *
 * Exige também os escopos declarados na rota com `@Scopes(...)`, igual à API
 * pública. Sem isto, qualquer token ativo do tenant — inclusive um criado só
 * com `clientes:read` — conseguia GRAVAR clientes e faturas pela ingestão,
 * contrariando a promessa de que o token só acessa o que os escopos permitem.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly keys: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { apiTenantId?: string; apiScopes?: string[] }>();
    const key = (req.headers['x-api-key'] as string) || '';
    if (!key) throw new UnauthorizedException('x-api-key ausente');

    const ctx = await this.keys.resolve(key);
    if (!ctx.tenantId) throw new UnauthorizedException('Token de plataforma não pode ingerir dados de tenant');

    const exigidos = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    for (const escopo of exigidos) {
      if (!ctx.scopes.includes(escopo)) throw new ForbiddenException(`O token não tem o escopo "${escopo}".`);
    }

    req.apiTenantId = ctx.tenantId;
    req.apiScopes = ctx.scopes;
    return true;
  }
}
