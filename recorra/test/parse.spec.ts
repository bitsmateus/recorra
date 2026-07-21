import { describe, it, expect } from 'vitest';
import { parseDateOrThrow, parseDateFilter, parseNumberFilter } from '@/common/util/parse';

describe('parse util', () => {
  it('parseDateOrThrow aceita data válida', () => {
    expect(parseDateOrThrow('2026-07-20').toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });

  it('parseDateOrThrow lança 400 em data inválida', () => {
    expect(() => parseDateOrThrow('lixo', 'vencimento')).toThrow(/vencimento inválida/);
  });

  it('parseDateFilter ignora ausente/ inválida', () => {
    expect(parseDateFilter(undefined)).toBeUndefined();
    expect(parseDateFilter('')).toBeUndefined();
    expect(parseDateFilter('abc')).toBeUndefined();
    expect(parseDateFilter('2026-01-01')?.getUTCFullYear()).toBe(2026);
  });

  it('parseNumberFilter só aceita número finito', () => {
    expect(parseNumberFilter(undefined)).toBeUndefined();
    expect(parseNumberFilter('')).toBeUndefined();
    expect(parseNumberFilter('abc')).toBeUndefined();
    expect(parseNumberFilter('Infinity')).toBeUndefined();
    expect(parseNumberFilter('12.5')).toBe(12.5);
    expect(parseNumberFilter(30)).toBe(30);
  });
});
