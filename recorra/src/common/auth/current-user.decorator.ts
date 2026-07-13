import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './jwt.types';

/** Injeta o usuário autenticado: `@CurrentUser() user: AuthUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);

/** Injeta apenas o tenantId: `@TenantId() tenantId: string`. */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return req.user.tenantId;
});
