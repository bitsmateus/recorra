import { describe, it, expect } from 'vitest';
import { scopesPermitidos, isScopePlataforma, isScopeValido } from '../src/modules/public-api/scopes';

describe('escopos da API', () => {
  it('token de TENANT nunca recebe escopo de plataforma', () => {
    const t = scopesPermitidos('TENANT');
    expect(t).not.toContain('tenants:read');
    expect(t).not.toContain('tenants:write');
    expect(t).toContain('clientes:read');
    expect(t).toContain('cobrancas:write');
  });

  it('token de PLATFORM recebe todos, inclusive tenants', () => {
    const p = scopesPermitidos('PLATFORM');
    expect(p).toContain('tenants:write');
    expect(p).toContain('clientes:read');
  });

  it('isScopePlataforma marca só os de plataforma', () => {
    expect(isScopePlataforma('tenants:write')).toBe(true);
    expect(isScopePlataforma('tenants:read')).toBe(true);
    expect(isScopePlataforma('clientes:read')).toBe(false);
    expect(isScopePlataforma('cobrancas:write')).toBe(false);
  });

  it('rejeita escopo inexistente', () => {
    expect(isScopeValido('clientes:read')).toBe(true);
    expect(isScopeValido('clientes:delete')).toBe(false);
    expect(isScopeValido('qualquer:coisa')).toBe(false);
  });
});
