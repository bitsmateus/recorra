import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from '@/modules/ingest/api-key.guard';
import { SCOPES_KEY } from '@/common/auth/scopes.decorator';

/**
 * PoC de segurança — escopos dos tokens de API.
 *
 * A promessa ao usuário (tela de API e Central de Ajuda) é: "cada rota exige um
 * escopo específico; o token só acessa o que os escopos permitem". A ingestão
 * (`/api/ingest/*`) autenticava só o tenant e ignorava os escopos, então um
 * token criado como somente-leitura GRAVAVA clientes e faturas.
 *
 * Estes testes descrevem o comportamento seguro e devem continuar passando.
 */

/** Reflector falso: devolve os escopos que a "rota" declarou com @Scopes(). */
const reflectorCom = (escopos: string[]) => ({
  getAllAndOverride: vi.fn((chave: string) => (chave === SCOPES_KEY ? escopos : undefined)),
}) as never;

/** ExecutionContext mínimo com o header x-api-key. */
const contexto = (apiKey?: string) => {
  const req: Record<string, unknown> = { headers: apiKey ? { 'x-api-key': apiKey } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
    __req: req,
  } as never as { switchToHttp: () => unknown; __req: Record<string, unknown> };
};

/** ApiKeyService falso: resolve o token para um contexto fixo. */
const keysCom = (ctx: { id: string; tenantId: string | null; tipo: 'TENANT' | 'PLATFORM'; scopes: string[] }) =>
  ({ resolve: vi.fn(async () => ctx) }) as never;

describe('[SEC-01] Ingestão respeita os escopos do token', () => {
  const somenteLeitura = { id: 'k1', tenantId: 'tenant-A', tipo: 'TENANT' as const, scopes: ['clientes:read'] };

  it('token somente-leitura NÃO pode gravar clientes (exige clientes:write)', async () => {
    const guard = new ApiKeyGuard(keysCom(somenteLeitura), reflectorCom(['clientes:write']));
    await expect(guard.canActivate(contexto('rec_abc') as never)).rejects.toThrow(ForbiddenException);
  });

  it('token somente-leitura NÃO pode gravar faturas (exige cobrancas:write)', async () => {
    const guard = new ApiKeyGuard(keysCom(somenteLeitura), reflectorCom(['cobrancas:write']));
    await expect(guard.canActivate(contexto('rec_abc') as never)).rejects.toThrow(ForbiddenException);
  });

  it('token com o escopo certo passa e injeta o tenant da própria chave', async () => {
    const escrita = { id: 'k2', tenantId: 'tenant-A', tipo: 'TENANT' as const, scopes: ['clientes:write'] };
    const guard = new ApiKeyGuard(keysCom(escrita), reflectorCom(['clientes:write']));
    const ctx = contexto('rec_abc');
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(ctx.__req.apiTenantId).toBe('tenant-A');
  });

  it('token de PLATAFORMA não ingere dados de tenant', async () => {
    const plataforma = { id: 'k3', tenantId: null, tipo: 'PLATFORM' as const, scopes: ['clientes:write'] };
    const guard = new ApiKeyGuard(keysCom(plataforma), reflectorCom(['clientes:write']));
    await expect(guard.canActivate(contexto('rec_abc') as never)).rejects.toThrow(UnauthorizedException);
  });

  it('sem header x-api-key não passa', async () => {
    const guard = new ApiKeyGuard(keysCom(somenteLeitura), reflectorCom([]));
    await expect(guard.canActivate(contexto() as never)).rejects.toThrow(UnauthorizedException);
  });
});
