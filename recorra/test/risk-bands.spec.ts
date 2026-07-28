import { describe, expect, it } from 'vitest';
import { bandFromScore } from '../src/modules/risk/bands';

describe('faixas do score de pagamento', () => {
  it('considera scores maiores como melhores', () => {
    expect(bandFromScore(0)).toBe('RISCO');
    expect(bandFromScore(29)).toBe('RISCO');
    expect(bandFromScore(30)).toBe('ATENCAO');
    expect(bandFromScore(69)).toBe('ATENCAO');
    expect(bandFromScore(70)).toBe('BOM');
    expect(bandFromScore(100)).toBe('BOM');
  });
});
