import { describe, expect, it } from 'vitest';
import { avaliarRisco } from '@/modules/risk/avaliacao';

const now = new Date('2026-11-16T12:00:00Z');
const paga = (venc: string, diasAtraso: number) => {
  const v = new Date(`${venc}T00:00:00Z`);
  return { status: 'PAGA', vencimento: v, pagoEm: new Date(v.getTime() + diasAtraso * 86400000 + 15 * 3600000) };
};

describe('risco pelas últimas cobranças pagas', () => {
  it('sempre em dia: 100, Bom pagador, com o motivo', () => {
    const r = avaliarRisco([paga('2026-10-10', 0), paga('2026-09-10', 1), paga('2026-08-10', 0)], now);
    expect(r.score).toBe(100);
    expect(r.faixa).toBe('BOM');
    expect(r.fatores.map((f) => f.detalhe).join(' | ')).toContain('3 de 3 paga(s) em dia');
    expect(r.historico).toHaveLength(3);
  });

  it('usa só as 6 mais recentes: atraso antigo não pesa mais', () => {
    const antigas = Array.from({ length: 4 }, (_, i) => paga(`2025-0${i + 1}-10`, 60));
    const recentes = Array.from({ length: 6 }, (_, i) => paga(`2026-0${i + 3}-10`, 0));
    const r = avaliarRisco([...antigas, ...recentes], now);
    expect(r.historico).toHaveLength(6);
    expect(r.faixa).toBe('BOM');
  });

  it('atraso médio alto derruba para Risco e mostra o pior atraso', () => {
    const r = avaliarRisco([paga('2026-10-10', 40), paga('2026-09-10', 35), paga('2026-08-10', 38)], now);
    expect(r.faixa).toBe('RISCO');
    expect(r.fatores.some((f) => f.fator === 'pior_atraso')).toBe(true);
  });

  it('atrasos moderados = Atenção', () => {
    const r = avaliarRisco([paga('2026-10-10', 10), paga('2026-09-10', 12), paga('2026-08-10', 9)], now);
    expect(r.score).toBe(65); // média ~10 dias: -35
    expect(r.faixa).toBe('ATENCAO');
  });

  it('fatura vencida em aberto pesa por cima do histórico', () => {
    const base = [paga('2026-09-10', 0), paga('2026-08-10', 0)];
    const r = avaliarRisco([...base, { status: 'VENCIDA', vencimento: new Date('2026-09-20T00:00:00Z') }], now);
    expect(r.score).toBe(70); // 100 - 30 (57 dias em aberto)
    expect(r.fatores.find((f) => f.fator === 'em_aberto')?.detalhe).toContain('57 dia(s)');
  });

  it('sem nenhuma paga: Atenção, explicando que não há histórico', () => {
    const r = avaliarRisco([], now);
    expect(r.faixa).toBe('ATENCAO');
    expect(r.fatores[0].fator).toBe('sem_historico');
  });

  it('tendência: última paga muito mais atrasada que as anteriores', () => {
    const r = avaliarRisco([paga('2026-10-10', 20), paga('2026-09-10', 0), paga('2026-08-10', 1)], now);
    expect(r.fatores.some((f) => f.fator === 'piorando')).toBe(true);
  });
});
