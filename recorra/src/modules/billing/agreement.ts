/** Cálculo puro de acordo/negociação (parcelamento com desconto). */

export interface Installment {
  numero: number;
  valor: number; // em reais, 2 casas
  vencimento: Date;
}

/** Arredonda para 2 casas evitando erros de ponto flutuante. */
export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Valor acordado após aplicar desconto percentual sobre o total original.
 * descontoPct em % (ex.: 20 = 20% de desconto).
 */
export function valorComDesconto(valorOriginal: number, descontoPct: number): number {
  const pct = Math.max(0, Math.min(100, descontoPct));
  return round2(valorOriginal * (1 - pct / 100));
}

/**
 * Divide o valor acordado em N parcelas. A última parcela absorve a diferença
 * de arredondamento para que a soma feche exatamente com o total.
 * `primeiraData` é o vencimento da 1ª parcela; as demais somam 1 mês (mesmo dia).
 */
export function buildInstallments(valorAcordado: number, parcelas: number, primeiraData: Date): Installment[] {
  if (parcelas < 1) parcelas = 1;
  const base = round2(valorAcordado / parcelas);
  const result: Installment[] = [];
  let acumulado = 0;

  for (let i = 1; i <= parcelas; i++) {
    const isUltima = i === parcelas;
    const valor = isUltima ? round2(valorAcordado - acumulado) : base;
    acumulado = round2(acumulado + valor);
    const dia = primeiraData.getDate();
    const venc = new Date(primeiraData.getFullYear(), primeiraData.getMonth() + (i - 1), 1);
    const ultimoDia = new Date(venc.getFullYear(), venc.getMonth() + 1, 0).getDate();
    venc.setDate(Math.min(dia, ultimoDia));
    result.push({ numero: i, valor, vencimento: venc });
  }
  return result;
}

/** Soma das parcelas (para validação: deve bater com o valor acordado). */
export function somaParcelas(parcelas: Installment[]): number {
  return round2(parcelas.reduce((s, p) => s + p.valor, 0));
}
