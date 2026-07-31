import { SetMetadata } from '@nestjs/common';

/** Escopo(s) que a rota de API pública exige. O PublicApiGuard valida. */
export const SCOPES_KEY = 'apiScopes';
export const Scopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);
