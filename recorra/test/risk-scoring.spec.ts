import { describe, it, expect } from 'vitest';
import { bandFromScore } from '@/modules/risk/bands';

// Semântica do score de pagamento: quanto MAIOR, melhor (fatores bons somam
// pontos, ruins subtraem). Faixas: >=70 BOM, 30-69 ATENÇÃO, <30 RISCO.
describe('bandFromScore', () => {
  it('70-100 → BOM', () => {
    expect(bandFromScore(70)).toBe('BOM');
    expect(bandFromScore(100)).toBe('BOM');
  });

  it('30-69 → ATENCAO', () => {
    expect(bandFromScore(30)).toBe('ATENCAO');
    expect(bandFromScore(69)).toBe('ATENCAO');
  });

  it('0-29 → RISCO', () => {
    expect(bandFromScore(0)).toBe('RISCO');
    expect(bandFromScore(29)).toBe('RISCO');
  });
});
