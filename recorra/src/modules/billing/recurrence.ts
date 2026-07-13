/** Lógica pura de recorrência (assinaturas) — testável sem banco. */

export type Ciclo = 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'SEMANAL';

const MESES: Record<Ciclo, number> = { MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12, SEMANAL: 0 };

/**
 * Próxima data de vencimento a partir de uma data de referência.
 * Para ciclos mensais+, usa o `diaVenc` (ajustando para o último dia do mês
 * quando o dia não existe, ex.: 31 em fevereiro). Semanal soma 7 dias.
 */
export function nextDueDate(diaVenc: number, ciclo: Ciclo, from: Date): Date {
  if (ciclo === 'SEMANAL') {
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
  }
  const passo = MESES[ciclo];
  let ano = from.getFullYear();
  let mes = from.getMonth() + passo;
  ano += Math.floor(mes / 12);
  mes = ((mes % 12) + 12) % 12;
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const dia = Math.min(diaVenc, ultimoDia);
  return new Date(ano, mes, dia);
}

/**
 * Agenda de retentativas após falha na captura (modelo Asaas):
 * tenta no vencimento e mais N vezes com intervalo de dias.
 * Retorna as datas de tentativa a partir do vencimento.
 */
export function retrySchedule(vencimento: Date, maxTentativas = 4, intervaloDias = 1): Date[] {
  const datas: Date[] = [];
  for (let i = 1; i <= maxTentativas; i++) {
    datas.push(new Date(vencimento.getFullYear(), vencimento.getMonth(), vencimento.getDate() + i * intervaloDias));
  }
  return datas;
}

/** Verdadeiro se ainda há tentativas disponíveis. */
export function podeRetentar(tentativas: number, maxTentativas = 4): boolean {
  return tentativas < maxTentativas;
}
