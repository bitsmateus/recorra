import { describe, it, expect } from 'vitest';
import { nextDueDate, retrySchedule, podeRetentar } from '@/modules/billing/recurrence';

const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

describe('nextDueDate', () => {
  it('mensal usa o dia de vencimento', () => {
    expect(ymd(nextDueDate(10, 'MENSAL', new Date(2026, 0, 15)))).toEqual([2026, 2, 10]);
  });
  it('ajusta dia 31 para o último dia de fevereiro', () => {
    expect(ymd(nextDueDate(31, 'MENSAL', new Date(2026, 0, 31)))).toEqual([2026, 2, 28]);
  });
  it('semanal soma 7 dias', () => {
    expect(ymd(nextDueDate(10, 'SEMANAL', new Date(2026, 0, 15)))).toEqual([2026, 0 + 1, 22]);
  });
  it('anual avança 12 meses', () => {
    expect(ymd(nextDueDate(10, 'ANUAL', new Date(2026, 2, 10)))).toEqual([2027, 3, 10]);
  });
});

describe('retrySchedule / podeRetentar', () => {
  it('gera N tentativas após o vencimento', () => {
    const datas = retrySchedule(new Date(2026, 0, 10), 3, 1);
    expect(datas.map(ymd)).toEqual([[2026, 1, 11], [2026, 1, 12], [2026, 1, 13]]);
  });
  it('controla o limite de tentativas', () => {
    expect(podeRetentar(0, 4)).toBe(true);
    expect(podeRetentar(4, 4)).toBe(false);
  });
});
