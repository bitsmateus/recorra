import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyService } from './api-key.service';

/**
 * Autentica requisições de ingestão externa pelo header `x-api-key`.
 * Injeta `req.apiTenantId` com o tenant resolvido.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { apiTenantId?: string }>();
    const key = (req.headers['x-api-key'] as string) || '';
    if (!key) throw new UnauthorizedException('x-api-key ausente');
    req.apiTenantId = await this.keys.resolveTenant(key);
    return true;
  }
}
