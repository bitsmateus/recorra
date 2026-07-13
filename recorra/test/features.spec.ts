import { describe, it, expect } from 'vitest';
import { computeFeatures } from '@/modules/risk/features';

const d = (s: string) => new Date(s);

describe('computeFeatures', () => {
  it('conta pagas, vencidas e atrasos', () => {
    const now = d('2026-02-01');
    const f = computeFeatures(
      [
        { status: 'PAGA', vencimento: d('2026-01-10'), pagoEm: d('2026-01-10') }, // em dia
        { status: 'PAGA', vencimento: d('2026-01-05'), pagoEm: d('2026-01-15') }, // 10 dias atraso
        { status: 'VENCIDA', vencimento: d('2026-01-22'), pagoEm: null }, // 10 dias vencida
      ],
      { now, enviadas: 4, lidas: 2 },
    );
    expect(f.faturasPagas).toBe(2);
    expect(f.faturasVencidas).toBe(1);
    expect(f.atrasosQtd).toBe(2); // 1 paga em atraso + 1 vencida
    expect(f.atrasoMedioDias).toBe(10); // (10 + 10) / 2
    expect(f.taxaResposta).toBe(0.5);
  });

  it('cliente sem histórico → tudo zero', () => {
    const f = computeFeatures([]);
    expect(f.atrasosQtd).toBe(0);
    expect(f.atrasoMedioDias).toBe(0);
    expect(f.faturasPagas).toBe(0);
    expect(f.taxaResposta).toBe(0);
    expect(f.ultimoAtrasoEm).toBeNull();
  });

  it('bom pagador em dia não gera atraso', () => {
    const f = computeFeatures([
      { status: 'PAGA', vencimento: d('2026-01-10'), pagoEm: d('2026-01-09') },
    ]);
    expect(f.atrasosQtd).toBe(0);
    expect(f.faturasPagas).toBe(1);
  });
});
