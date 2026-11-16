/**
 * Distribuição automática dos clientes vencidos entre os operadores de uma
 * carteira — pura e testável.
 *
 *  - BALANCEADA: cada cliente novo vai para quem está com MENOS clientes da
 *    carteira no momento (empate: ordem da lista de operadores).
 *  - SEQUENCIAL: rodízio — um para cada, na ordem, continuando de onde a última
 *    distribuição parou (cursor persistido na carteira).
 *
 * Só distribui quem PRECISA: cliente sem responsável, ou cujo responsável não é
 * operador desta carteira (ex.: passou da Cobrança 1 para a Cobrança 2). Quem já
 * está com um operador da carteira fica com ele.
 */
export type ModoDistribuicao = 'MANUAL' | 'BALANCEADA' | 'SEQUENCIAL';

export interface EntradaDistribuicao {
  modo: ModoDistribuicao;
  operadores: string[]; // ids, em ordem estável
  clientes: { id: string; responsavelId: string | null }[];
  cursor: number;
}

export interface ResultadoDistribuicao {
  atribuicoes: Map<string, string>; // clienteId -> operadorId (só as mudanças)
  mantidos: number;
  carga: Map<string, number>; // total por operador ao final
  cursor: number;
}

export function distribuir(e: EntradaDistribuicao): ResultadoDistribuicao {
  const carga = new Map<string, number>(e.operadores.map((o) => [o, 0]));
  const atribuicoes = new Map<string, string>();
  let cursor = e.cursor;
  if (e.modo === 'MANUAL' || !e.operadores.length) return { atribuicoes, mantidos: 0, carga, cursor };

  const pendentes: string[] = [];
  let mantidos = 0;
  for (const c of e.clientes) {
    if (c.responsavelId && carga.has(c.responsavelId)) {
      carga.set(c.responsavelId, carga.get(c.responsavelId)! + 1);
      mantidos++;
    } else {
      pendentes.push(c.id);
    }
  }

  for (const id of pendentes) {
    let op: string;
    if (e.modo === 'SEQUENCIAL') {
      op = e.operadores[((cursor % e.operadores.length) + e.operadores.length) % e.operadores.length];
      cursor++;
    } else {
      op = e.operadores[0];
      for (const o of e.operadores) if (carga.get(o)! < carga.get(op)!) op = o;
    }
    atribuicoes.set(id, op);
    carga.set(op, carga.get(op)! + 1);
  }
  return { atribuicoes, mantidos, carga, cursor: e.operadores.length ? cursor % e.operadores.length : 0 };
}
