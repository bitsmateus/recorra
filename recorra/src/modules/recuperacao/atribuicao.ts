/**
 * Atribuição da recuperação — puro e testável.
 *
 * Regra de negócio (definida com o cliente): o CRÉDITO de uma fatura paga é do
 * operador RESPONSÁVEL pela cobrança daquele cliente, seja o contato que antecedeu
 * o pagamento automático (régua) ou manual. A ORIGEM registra qual foi o último
 * contato dentro da janela — é ela que separa "a régua recuperou" de "a operadora
 * recuperou no contato manual" no relatório.
 */
import { carteiraDaFaixa, CarteiraFaixa } from '@/modules/dunning/carteiras';

export type OrigemContato = 'REGUA' | 'MANUAL' | 'CAMPANHA';
export type OrigemRecuperacao = OrigemContato | 'SEM_CONTATO';

/** Um toque no cliente: disparo (régua/manual/campanha) ou nota/promessa do operador. */
export interface Contato {
  data: Date;
  origem: OrigemContato;
  userId?: string | null;
  dispatchId?: string | null;
  invoiceId?: string | null;
}

export interface EntradaAtribuicao {
  invoiceId: string;
  vencimento: Date;
  pagoEm: Date;
  responsavelId: string | null;
  janelaDias: number;
  carteiras: CarteiraFaixa[];
  contatos: Contato[];
  timezone?: string;
}

export interface Atribuicao {
  recuperadoOrigem: OrigemRecuperacao;
  recuperadoPorId: string | null;
  recuperadoDispatchId: string | null;
  recuperadoCarteira: string | null;
  diasAtrasoPagamento: number;
}

const DIA = 86_400_000;

/** Dia civil (meia-noite UTC do dia local no fuso) — mesma convenção do vencimento gravado. */
export function diaCivil(d: Date, timezone = 'America/Sao_Paulo'): number {
  const ymd = d.toLocaleDateString('sv-SE', { timeZone: timezone });
  return Date.parse(`${ymd}T00:00:00Z`);
}

/** Dias de atraso no pagamento (0 quando pagou até o vencimento). */
export function diasDeAtraso(vencimento: Date, pagoEm: Date, timezone?: string): number {
  const venc = Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), vencimento.getUTCDate());
  return Math.max(0, Math.round((diaCivil(pagoEm, timezone) - venc) / DIA));
}

/**
 * Último contato dentro da janela [pagoEm - janelaDias, pagoEm]. Contato da
 * PRÓPRIA fatura vence contato genérico do cliente no mesmo instante; fora isso
 * vale o mais recente (o último toque antes de pagar).
 */
export function ultimoContato(contatos: Contato[], invoiceId: string, pagoEm: Date, janelaDias: number): Contato | null {
  const inicio = pagoEm.getTime() - Math.max(0, janelaDias) * DIA;
  const fim = pagoEm.getTime();
  let melhor: Contato | null = null;
  for (const c of contatos) {
    const t = c.data.getTime();
    if (t < inicio || t > fim) continue;
    if (!melhor) { melhor = c; continue; }
    const tm = melhor.data.getTime();
    if (t > tm || (t === tm && c.invoiceId === invoiceId && melhor.invoiceId !== invoiceId)) melhor = c;
  }
  return melhor;
}

export function atribuir(e: EntradaAtribuicao): Atribuicao {
  const contato = ultimoContato(e.contatos, e.invoiceId, e.pagoEm, e.janelaDias);
  const dias = diasDeAtraso(e.vencimento, e.pagoEm, e.timezone);
  const origem: OrigemRecuperacao = contato?.origem ?? 'SEM_CONTATO';
  // Crédito = responsável pelo cliente. Sem responsável definido, o operador que
  // fez o último contato manual leva (alguém de fato trabalhou o cliente).
  const porId = e.responsavelId ?? (contato?.origem === 'MANUAL' ? contato.userId ?? null : null);
  return {
    recuperadoOrigem: origem,
    recuperadoPorId: porId,
    recuperadoDispatchId: contato?.dispatchId ?? null,
    recuperadoCarteira: carteiraDaFaixa(dias, e.carteiras)?.nome ?? null,
    diasAtrasoPagamento: dias,
  };
}
