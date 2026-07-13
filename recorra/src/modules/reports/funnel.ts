/** Funil de recuperação — agregações puras e testáveis. */

export interface DispatchRow {
  canal: string;
  offsetDias?: number;
  enviado: boolean; // status ENVIADO/ENTREGUE/LIDO
  pago: boolean; // fatura associada foi paga
}

export interface FunnelBucket {
  chave: string;
  enviados: number;
  pagos: number;
  taxa: number; // pagos/enviados
}

function agg(rows: DispatchRow[], keyOf: (r: DispatchRow) => string): FunnelBucket[] {
  const map = new Map<string, { enviados: number; pagos: number }>();
  for (const r of rows) {
    if (!r.enviado) continue;
    const k = keyOf(r);
    const cur = map.get(k) ?? { enviados: 0, pagos: 0 };
    cur.enviados++;
    if (r.pago) cur.pagos++;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([chave, v]) => ({ chave, enviados: v.enviados, pagos: v.pagos, taxa: v.enviados > 0 ? v.pagos / v.enviados : 0 }))
    .sort((a, b) => a.chave.localeCompare(b.chave));
}

/** Funil por canal. */
export function funnelByChannel(rows: DispatchRow[]): FunnelBucket[] {
  return agg(rows, (r) => r.canal);
}

/** Funil por passo da régua (offset de dias). */
export function funnelByStep(rows: DispatchRow[]): FunnelBucket[] {
  return agg(rows, (r) => String(r.offsetDias ?? 0)).sort((a, b) => Number(a.chave) - Number(b.chave));
}
