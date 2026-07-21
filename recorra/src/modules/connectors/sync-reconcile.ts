import { InvoiceStatus } from '@prisma/client';

/** Fatura local mínima para decidir a conciliação por ausência. */
export interface FaturaLocal {
  id: string;
  sourceExternalId: string | null;
  status: InvoiceStatus;
}

/**
 * Conciliação por ausência (ERP pull-only, sem webhook).
 *
 * O Recorrai só enxerga o ERP puxando a lista de faturas "em aberto". Quando o
 * cliente paga, a fatura sai dessa lista — mas o registro local continua em
 * aberto e a régua seguiria cobrando quem já pagou. Aqui detectamos isso: toda
 * fatura local PENDENTE/VENCIDA cujo `sourceExternalId` sumiu da lista de abertas
 * do ERP é considerada quitada.
 *
 * Salvaguardas:
 *  - Só mexe em PENDENTE/VENCIDA (nunca em PAGA/CANCELADA/ESTORNADA).
 *  - Se o fetch não trouxe nada (`fetchTrouxeAlgo=false` — resposta vazia ou erro
 *    de API), retorna [] em vez de "quitar tudo". É a trava contra marcar todas as
 *    faturas como pagas por uma falha transitória do ERP.
 */
export function faturasQuitadasPorAusencia(
  locais: FaturaLocal[],
  externalIdsPresentes: Set<string>,
  fetchTrouxeAlgo: boolean,
): string[] {
  if (!fetchTrouxeAlgo) return [];
  return locais
    .filter((f) => f.status === 'PENDENTE' || f.status === 'VENCIDA')
    .filter((f) => !!f.sourceExternalId && !externalIdsPresentes.has(f.sourceExternalId))
    .map((f) => f.id);
}
