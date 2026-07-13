import { describe, it, expect } from 'vitest';
import { valorComDesconto, buildInstallments, somaParcelas, round2 } from '@/modules/billing/agreement';

describe('valorComDesconto', () => {
  it('aplica desconto percentual', () => {
    expect(valorComDesconto(100, 20)).toBe(80);
    expect(valorComDesconto(199.9, 10)).toBe(179.91);
  });
  it('limita entre 0 e 100%', () => {
    expect(valorComDesconto(100, 150)).toBe(0);
    expect(valorComDesconto(100, -5)).toBe(100);
  });
});

describe('buildInstallments', () => {
  it('divide em parcelas e a soma fecha com o total', () => {
    const parc = buildInstallments(100, 3, new Date(2026, 0, 10));
    expect(parc.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(somaParcelas(parc)).toBe(100);
  });
  it('gera vencimentos mensais no mesmo dia', () => {
    const parc = buildInstallments(300, 3, new Date(2026, 0, 5));
    expect(parc.map((p) => [p.vencimento.getFullYear(), p.vencimento.getMonth() + 1, p.vencimento.getDate()])).toEqual([
      [2026, 1, 5],
      [2026, 2, 5],
      [2026, 3, 5],
    ]);
  });
  it('parcela única = valor cheio', () => {
    const parc = buildInstallments(150.5, 1, new Date(2026, 0, 10));
    expect(parc).toHaveLength(1);
    expect(parc[0].valor).toBe(150.5);
  });
});

describe('round2', () => {
  it('arredonda para 2 casas', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
