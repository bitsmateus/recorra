import { createHash } from 'node:crypto';

/** A/B testing de mensagens da régua. */

export type Variante = 'A' | 'B';

/**
 * Escolhe a variante de forma DETERMINÍSTICA a partir de uma semente
 * (ex.: customerId+stepId): ~50/50, estável entre execuções.
 */
export function pickVariant(seed: string): Variante {
  const h = createHash('sha256').update(seed).digest();
  return h[0] % 2 === 0 ? 'A' : 'B';
}

export interface VariantStat {
  variante: Variante;
  enviados: number;
  pagos: number;
}

export interface VariantResult extends VariantStat {
  taxa: number; // pagos/enviados (0-1)
}

/**
 * Calcula a taxa de pagamento por variante e aponta a vencedora.
 * Só declara vencedora com amostra mínima em ambas (default 20).
 */
export function evaluateAb(stats: VariantStat[], amostraMinima = 20): { resultados: VariantResult[]; vencedora: Variante | null } {
  const resultados: VariantResult[] = stats.map((s) => ({
    ...s,
    taxa: s.enviados > 0 ? s.pagos / s.enviados : 0,
  }));

  const a = resultados.find((r) => r.variante === 'A');
  const b = resultados.find((r) => r.variante === 'B');
  let vencedora: Variante | null = null;
  if (a && b && a.enviados >= amostraMinima && b.enviados >= amostraMinima) {
    if (a.taxa !== b.taxa) vencedora = a.taxa > b.taxa ? 'A' : 'B';
  }
  return { resultados, vencedora };
}
