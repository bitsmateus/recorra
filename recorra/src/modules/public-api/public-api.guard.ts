import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiKeyService, ApiKeyContexto } from '@/modules/ingest/api-key.service';
import { SCOPES_KEY } from '@/common/auth/scopes.decorator';
import { isScopePlataforma } from './scopes';

export interface RequestComApiKey extends Request {
  apiKey?: ApiKeyContexto;
}

/**
 * Autentica a API pública (`/api/v1/*`) pelo header `x-api-key` e exige que o
 * token tenha o escopo declarado na rota com `@Scopes(...)`.
 *  - Escopo de plataforma (tenants:*) → só token de PLATAFORMA.
 *  - Escopo de tenant → token de TENANT, e injeta o `tenantId` resolvido.
 */
@Injectable()
export class PublicApiGuard implements CanActivate {
  constructor(
    private readonly keys: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestComApiKey>();
    const raw = (req.headers['x-api-key'] as string) || '';
    if (!raw) throw new UnauthorizedException('x-api-key ausente');

    const ctx = await this.keys.resolve(raw);
    req.apiKey = ctx;

    const exigidos = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    for (const escopo of exigidos) {
      if (!ctx.scopes.includes(escopo)) throw new ForbiddenException(`O token não tem o escopo "${escopo}".`);
      if (isScopePlataforma(escopo)) {
        if (ctx.tipo !== 'PLATFORM') throw new ForbiddenException('Esta rota exige um token de plataforma.');
      } else if (!ctx.tenantId) {
        throw new ForbiddenException('Esta rota exige um token de tenant.');
      }
    }
    return true;
  }
}
