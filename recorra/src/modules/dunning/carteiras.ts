/** Carteira de cobrança configurável por tenant (ver Carteira no schema). */
export interface CarteiraFaixa {
  id: string;
  nome: string;
  diaMinimo: number;
}

/**
 * Qual carteira assume uma fatura com este tanto de dias de atraso: a de maior
 * `diaMinimo` que ainda seja <= diffDias (a lista não precisa estar ordenada).
 * `null` quando o atraso é menor que o `diaMinimo` de TODAS as carteiras — a
 * fatura ainda não caiu em nenhuma equipe (só quem não tem carteira restrita vê).
 */
export function carteiraDaFaixa(diffDias: number, carteiras: CarteiraFaixa[]): CarteiraFaixa | null {
  const candidatas = carteiras.filter((c) => diffDias >= c.diaMinimo).sort((a, b) => b.diaMinimo - a.diaMinimo);
  return candidatas[0] ?? null;
}
