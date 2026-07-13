import { describe, it, expect } from 'vitest';
import { randomToken, hashToken, expiresInMinutes, expiresInDays, isExpired, safeEqual } from '@/common/auth/tokens';

describe('tokens', () => {
  it('randomToken gera valores únicos e hex', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]+$/);
    expect(a.length).toBe(64); // 32 bytes em hex
  });

  it('hashToken é determinístico e não é o token puro', () => {
    const t = 'meu-token';
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
    expect(hashToken(t).length).toBe(64);
  });

  it('expiresInMinutes/Days calculam no futuro', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    expect(expiresInMinutes(60, base).toISOString()).toBe('2026-01-01T01:00:00.000Z');
    expect(expiresInDays(7, base).toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('isExpired trata nulo e datas passadas/futuras', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    expect(isExpired(null, now)).toBe(true);
    expect(isExpired(new Date('2026-01-09T00:00:00Z'), now)).toBe(true);
    expect(isExpired(new Date('2026-01-11T00:00:00Z'), now)).toBe(false);
  });

  it('safeEqual compara corretamente', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
