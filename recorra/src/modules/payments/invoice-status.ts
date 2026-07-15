import { InvoiceStatus } from '@prisma/client';

/**
 * Máquina de estados da fatura — puro e testável.
 * Bloqueia transições ilegais (ex.: CANCELADA→PAGA, PAGA→PENDENTE, ESTORNADA→*).
 */
const TRANSICOES: Record<InvoiceStatus, InvoiceStatus[]> = {
  PENDENTE: ['VENCIDA', 'PAGA', 'CANCELADA'],
  VENCIDA: ['PENDENTE', 'PAGA', 'CANCELADA'],
  PAGA: ['ESTORNADA'],
  CANCELADA: [], // terminal
  ESTORNADA: [], // terminal
};

/** True se a transição de `from` para `to` é permitida (mesma situação = no-op válido). */
export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return true;
  return TRANSICOES[from]?.includes(to) ?? false;
}
