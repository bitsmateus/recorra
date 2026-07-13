import { describe, it, expect } from 'vitest';
import { hasRole, atLeast } from '@/common/auth/rbac';

describe('hasRole', () => {
  it('libera quando não há papéis exigidos', () => {
    expect(hasRole('LEITURA', [])).toBe(true);
  });
  it('permite quando o papel está na lista', () => {
    expect(hasRole('ADMIN', ['OWNER', 'ADMIN'])).toBe(true);
  });
  it('bloqueia quando o papel não está na lista', () => {
    expect(hasRole('OPERADOR', ['OWNER', 'ADMIN'])).toBe(false);
  });
});

describe('atLeast', () => {
  it('OWNER >= ADMIN', () => {
    expect(atLeast('OWNER', 'ADMIN')).toBe(true);
  });
  it('OPERADOR não é >= FINANCEIRO', () => {
    expect(atLeast('OPERADOR', 'FINANCEIRO')).toBe(false);
  });
  it('FINANCEIRO >= FINANCEIRO', () => {
    expect(atLeast('FINANCEIRO', 'FINANCEIRO')).toBe(true);
  });
});
