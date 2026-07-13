import { describe, it, expect } from 'vitest';
import { bandFromScore } from '@/modules/risk/bands';

describe('bandFromScore', () => {
  it('0-30 → BOM', () => {
    expect(bandFromScore(0)).toBe('BOM');
    expect(bandFromScore(30)).toBe('BOM');
  });

  it('31-70 → ATENCAO', () => {
    expect(bandFromScore(31)).toBe('ATENCAO');
    expect(bandFromScore(70)).toBe('ATENCAO');
  });

  it('71-100 → RISCO', () => {
    expect(bandFromScore(71)).toBe('RISCO');
    expect(bandFromScore(100)).toBe('RISCO');
  });
});
