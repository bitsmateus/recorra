/** Faixa de risco a partir do score de pagamento (0-100; quanto maior, melhor). */
export type Band = 'BOM' | 'ATENCAO' | 'RISCO';

export function bandFromScore(score: number): Band {
  if (score >= 70) return 'BOM';
  if (score >= 30) return 'ATENCAO';
  return 'RISCO';
}
