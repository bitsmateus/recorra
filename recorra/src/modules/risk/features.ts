/** Cálculo puro das features de histórico de pagamento (propensão a pagar). */

export interface InvoiceLike {
  status: string; // PAGA | VENCIDA | PENDENTE | ...
  vencimento: Date;
  pagoEm?: Date | null;
}

export interface PaymentFeatures {
  atrasosQtd: number;
  atrasoMedioDias: number;
  faturasPagas: number;
  faturasVencidas: number;
  ultimoAtrasoEm: Date | null;
  taxaResposta: number;
}

function diffDias(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

export function computeFeatures(
  invoices: InvoiceLike[],
  opts: { now?: Date; enviadas?: number; lidas?: number } = {},
): PaymentFeatures {
  const now = opts.now ?? new Date();
  let pagas = 0;
  let vencidas = 0;
  let atrasos = 0;
  let somaAtrasoDias = 0;
  let ultimoAtraso: Date | null = null;

  for (const inv of invoices) {
    if (inv.status === 'PAGA') {
      pagas++;
      if (inv.pagoEm && inv.pagoEm > inv.vencimento) {
        atrasos++;
        somaAtrasoDias += diffDias(inv.vencimento, inv.pagoEm);
        if (!ultimoAtraso || inv.vencimento > ultimoAtraso) ultimoAtraso = inv.vencimento;
      }
    } else if (inv.status === 'VENCIDA') {
      vencidas++;
      atrasos++;
      somaAtrasoDias += diffDias(inv.vencimento, now);
      if (!ultimoAtraso || inv.vencimento > ultimoAtraso) ultimoAtraso = inv.vencimento;
    }
  }

  const enviadas = opts.enviadas ?? 0;
  const lidas = opts.lidas ?? 0;

  return {
    atrasosQtd: atrasos,
    atrasoMedioDias: atrasos > 0 ? somaAtrasoDias / atrasos : 0,
    faturasPagas: pagas,
    faturasVencidas: vencidas,
    ultimoAtrasoEm: ultimoAtraso,
    taxaResposta: enviadas > 0 ? lidas / enviadas : 0,
  };
}
