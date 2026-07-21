import { describe, it, expect } from 'vitest';
import { computeSplit, valorLiquido } from '@/modules/payments/split';

describe('computeSplit', () => {
  it('calcula percentual sobre o total', () => {
    const s = computeSplit(200, [{ destino: 'wallet_a', percentual: 10 }]);
    expect(s).toEqual([{ destino: 'wallet_a', valor: 20 }]);
  });
  it('aceita valor fixo', () => {
    const s = computeSplit(200, [{ destino: 'wallet_a', valorFixo: 35.5 }]);
    expect(s).toEqual([{ destino: 'wallet_a', valor: 35.5 }]);
  });
  it('nunca ultrapassa o total', () => {
    const s = computeSplit(100, [
      { destino: 'a', percentual: 80 },
      { destino: 'b', percentual: 50 },
    ]);
    expect(s[0].valor).toBe(80);
    expect(s[1].valor).toBe(20); // capado no restante
  });
  it('valorLiquido desconta os repasses', () => {
    const s = computeSplit(100, [{ destino: 'a', percentual: 30 }]);
    expect(valorLiquido(100, s)).toBe(70);
  });
  it('processa valores fixos antes dos percentuais (contrato), mesmo se declarados depois', () => {
    // Total 100: percentual de 90 declarado antes de um fixo de 30.
    // Fixos primeiro → fixo recebe 30 integral; percentual (90) capado no restante (70).
    const s = computeSplit(100, [
      { destino: 'pct', percentual: 90 },
      { destino: 'fixo', valorFixo: 30 },
    ]);
    expect(s.find((x) => x.destino === 'fixo')?.valor).toBe(30);
    expect(s.find((x) => x.destino === 'pct')?.valor).toBe(70);
  });
});
