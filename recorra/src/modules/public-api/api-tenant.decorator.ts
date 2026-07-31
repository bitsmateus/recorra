import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { RequestComApiKey } from './public-api.guard';

/** tenantId do token (rotas de tenant). Lança se for token de plataforma. */
export const ApiTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<RequestComApiKey>();
  const tenantId = req.apiKey?.tenantId;
  if (!tenantId) throw new UnauthorizedException('Token sem tenant.');
  return tenantId;
});
