/** Cálculo puro de split de pagamento (marketplace/repasse). */

import { round2 } from '@/modules/billing/agreement';

export interface SplitRule {
  destino: string; // walletId / conta de destino
  // um dos dois: percentual (0-100) ou valor fixo
  percentual?: number;
  valorFixo?: number;
}

export interface SplitResult {
  destino: string;
  valor: number;
}

/**
 * Calcula os repasses a partir das regras. Valores fixos primeiro; percentuais
 * incidem sobre o total. Nunca ultrapassa o total da cobrança.
 */
export function computeSplit(total: number, regras: SplitRule[]): SplitResult[] {
  const out: SplitResult[] = [];
  let alocado = 0;
  // Contrato: valores fixos primeiro, percentuais depois (sort estável mantém a
  // ordem original dentro de cada grupo). Sem isto, um percentual declarado antes
  // de um fixo consumia o teto primeiro e truncava o fixo — divergindo do doc.
  const ordenadas = [...regras].sort(
    (a, b) => (a.valorFixo !== undefined ? 0 : 1) - (b.valorFixo !== undefined ? 0 : 1),
  );
  for (const r of ordenadas) {
    let valor = 0;
    if (r.valorFixo !== undefined) valor = r.valorFixo;
    else if (r.percentual !== undefined) valor = round2(total * (r.percentual / 100));
    valor = round2(Math.min(valor, round2(total - alocado)));
    if (valor <= 0) continue;
    alocado = round2(alocado + valor);
    out.push({ destino: r.destino, valor });
  }
  return out;
}

/** Valor que fica com o titular após os repasses. */
export function valorLiquido(total: number, splits: SplitResult[]): number {
  const repassado = splits.reduce((s, x) => s + x.valor, 0);
  return round2(total - repassado);
}
