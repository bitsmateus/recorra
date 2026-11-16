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
export type ModoDistribuicao = 'MANUAL' | 'BALANCEADA' | 'SEQUENCIAL' | 'BLOCOS';

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

/**
 * Divisão em BLOCOS (cima/baixo) — o que a planilha da equipe faz à mão: a lista do
 * dia, do mais atrasado ao menos atrasado, é cortada em fatias seguidas; a primeira
 * operadora fica com o topo, a última com o fim. Com 2 operadoras: metade de cima e
 * metade de baixo. O topo (os casos mais difíceis) REVEZA a cada dia, pelo número do
 * dia — determinístico, então rodar de novo no mesmo dia dá a mesma ordem.
 *
 * `fixo` = cliente que NÃO entra na divisão e continua com o responsável atual
 * (ex.: promessa de pagamento em vigor com a operadora desta carteira). Ele conta na
 * carga dela, e o bloco dela encolhe na mesma medida para o total ficar parelho.
 */
export interface EntradaBlocos {
  operadores: string[]; // ordem estável
  clientes: { id: string; responsavelId: string | null; fixo?: boolean }[]; // já do mais atrasado ao menos
  diaIndice: number; // dias desde uma data fixa (muda a cada dia)
}

export interface ResultadoBlocos {
  atribuicoes: Map<string, string>; // clienteId -> operadorId (de TODOS os clientes da divisão)
  carga: Map<string, number>;
  ordemDoDia: string[]; // 1ª = topo (mais atrasados), última = fim
  fixos: number;
}

export function dividirEmBlocos(e: EntradaBlocos): ResultadoBlocos {
  const ops = e.operadores;
  const n = ops.length;
  const atribuicoes = new Map<string, string>();
  const carga = new Map<string, number>(ops.map((o) => [o, 0]));
  if (!n) return { atribuicoes, carga, ordemDoDia: [], fixos: 0 };

  const offset = ((e.diaIndice % n) + n) % n;
  const ordem = [...ops.slice(offset), ...ops.slice(0, offset)];

  const fixos = e.clientes.filter((c) => c.fixo && c.responsavelId && carga.has(c.responsavelId));
  const fixoIds = new Set(fixos.map((c) => c.id));
  for (const c of fixos) {
    atribuicoes.set(c.id, c.responsavelId!);
    carga.set(c.responsavelId!, carga.get(c.responsavelId!)! + 1);
  }
  const livres = e.clientes.filter((c) => !fixoIds.has(c.id));

  // Total por operadora: parelho; as "sobras" ficam com quem está no topo no dia.
  const total = fixos.length + livres.length;
  const need = ordem.map((o, i) => Math.max(0, Math.floor(total / n) + (i < total % n ? 1 : 0) - carga.get(o)!));
  let falta = livres.length - need.reduce((a, b) => a + b, 0);
  for (let k = 0; falta > 0; k++, falta--) need[k % n]++;
  for (let i = n - 1; falta < 0 && i >= 0; ) { if (need[i] > 0) { need[i]--; falta++; } else i--; }

  let pos = 0;
  ordem.forEach((o, i) => {
    for (const c of livres.slice(pos, pos + need[i])) atribuicoes.set(c.id, o);
    carga.set(o, carga.get(o)! + need[i]);
    pos += need[i];
  });
  return { atribuicoes, carga, ordemDoDia: ordem, fixos: fixos.length };
}
