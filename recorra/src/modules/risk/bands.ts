/** Faixa de risco a partir do score (0-100). Função pura e testável. */
export type Band = 'BOM' | 'ATENCAO' | 'RISCO';

export function bandFromScore(score: number): Band {
  if (score <= 30) return 'BOM';
  if (score <= 70) return 'ATENCAO';
  return 'RISCO';
}
