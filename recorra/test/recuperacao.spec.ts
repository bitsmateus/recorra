import { describe, expect, it } from 'vitest';
import { atribuir, diasDeAtraso, ultimoContato, Contato } from '@/modules/recuperacao/atribuicao';
import { distribuir } from '@/modules/recuperacao/distribuicao';
import { montarRelatorio } from '@/modules/recuperacao/relatorio';
import { rotuloOrigem } from '@/modules/dispatches/dispatches.controller';

const carteiras = [
  { id: 'c1', nome: 'Cobrança 1', diaMinimo: 5 },
  { id: 'c2', nome: 'Cobrança 2', diaMinimo: 30 },
];
const d = (s: string) => new Date(s);

describe('atribuição da recuperação', () => {
  const base = {
    invoiceId: 'inv1',
    vencimento: d('2026-10-01T00:00:00Z'),
    pagoEm: d('2026-10-12T15:00:00-03:00'),
    responsavelId: 'lais',
    janelaDias: 7,
    carteiras,
  };

  it('crédito é da responsável mesmo quando o último contato foi da régua', () => {
    const contatos: Contato[] = [{ data: d('2026-10-10T09:00:00-03:00'), origem: 'REGUA', dispatchId: 'd1', invoiceId: 'inv1' }];
    const a = atribuir({ ...base, contatos });
    expect(a).toEqual({
      recuperadoOrigem: 'REGUA', recuperadoPorId: 'lais', recuperadoDispatchId: 'd1',
      recuperadoCarteira: 'Cobrança 1', diasAtrasoPagamento: 11,
    });
  });

  it('último contato manual vence a régua anterior (origem MANUAL), crédito segue da responsável', () => {
    const contatos: Contato[] = [
      { data: d('2026-10-08T09:00:00-03:00'), origem: 'REGUA', dispatchId: 'd1' },
      { data: d('2026-10-11T10:00:00-03:00'), origem: 'MANUAL', userId: 'graciele', dispatchId: 'd2' },
    ];
    const a = atribuir({ ...base, contatos });
    expect(a.recuperadoOrigem).toBe('MANUAL');
    expect(a.recuperadoPorId).toBe('lais');
    expect(a.recuperadoDispatchId).toBe('d2');
  });

  it('sem responsável: o operador do último contato manual leva o crédito', () => {
    const contatos: Contato[] = [{ data: d('2026-10-11T10:00:00-03:00'), origem: 'MANUAL', userId: 'izabel' }];
    expect(atribuir({ ...base, responsavelId: null, contatos }).recuperadoPorId).toBe('izabel');
  });

  it('sem responsável e último contato automático: sem crédito individual', () => {
    const contatos: Contato[] = [{ data: d('2026-10-11T10:00:00-03:00'), origem: 'REGUA' }];
    expect(atribuir({ ...base, responsavelId: null, contatos }).recuperadoPorId).toBeNull();
  });

  it('contato fora da janela ou depois do pagamento não conta (SEM_CONTATO)', () => {
    const contatos: Contato[] = [
      { data: d('2026-10-01T09:00:00-03:00'), origem: 'REGUA' }, // 11 dias antes, janela de 7
      { data: d('2026-10-13T09:00:00-03:00'), origem: 'MANUAL', userId: 'x' }, // depois de pagar
    ];
    const a = atribuir({ ...base, contatos });
    expect(a.recuperadoOrigem).toBe('SEM_CONTATO');
    expect(a.recuperadoDispatchId).toBeNull();
    expect(a.recuperadoPorId).toBe('lais');
  });

  it('carteira pelo atraso no pagamento; pago em dia fica antes da carteira', () => {
    expect(atribuir({ ...base, pagoEm: d('2026-11-05T10:00:00-03:00'), contatos: [] }).recuperadoCarteira).toBe('Cobrança 2');
    const emDia = atribuir({ ...base, pagoEm: d('2026-09-30T10:00:00-03:00'), contatos: [] });
    expect(emDia.recuperadoCarteira).toBeNull();
    expect(emDia.diasAtrasoPagamento).toBe(0);
  });

  it('dias de atraso usam o dia civil do fuso (pagamento às 22h de SP não vira o dia seguinte)', () => {
    expect(diasDeAtraso(d('2026-10-01T00:00:00Z'), d('2026-10-06T22:30:00-03:00'))).toBe(5);
  });

  it('empate no mesmo instante: prefere o contato da própria fatura', () => {
    const t = d('2026-10-11T10:00:00-03:00');
    const c = ultimoContato(
      [{ data: t, origem: 'REGUA', invoiceId: 'outra' }, { data: t, origem: 'MANUAL', invoiceId: 'inv1' }],
      'inv1', base.pagoEm, 7,
    );
    expect(c?.origem).toBe('MANUAL');
  });
});

describe('distribuição automática', () => {
  it('BALANCEADA completa quem tem menos, mantendo quem já tem dono na carteira', () => {
    const r = distribuir({
      modo: 'BALANCEADA',
      operadores: ['lais', 'graciele'],
      cursor: 0,
      clientes: [
        { id: 'a', responsavelId: 'lais' },
        { id: 'b', responsavelId: 'lais' },
        { id: 'c', responsavelId: null },
        { id: 'd', responsavelId: 'izabel' }, // é da Cobrança 2: redistribui
        { id: 'e', responsavelId: null },
      ],
    });
    expect(r.mantidos).toBe(2);
    expect([...r.atribuicoes.entries()]).toEqual([['c', 'graciele'], ['d', 'graciele'], ['e', 'lais']]);
    expect(Object.fromEntries(r.carga)).toEqual({ lais: 3, graciele: 2 });
  });

  it('SEQUENCIAL faz rodízio e continua de onde parou', () => {
    const r1 = distribuir({ modo: 'SEQUENCIAL', operadores: ['a', 'b', 'c'], cursor: 2, clientes: [{ id: '1', responsavelId: null }, { id: '2', responsavelId: null }] });
    expect([...r1.atribuicoes.values()]).toEqual(['c', 'a']);
    expect(r1.cursor).toBe(1);
  });

  it('500 vencidos com duas operadoras: 250 para cada', () => {
    const clientes = Array.from({ length: 500 }, (_, i) => ({ id: String(i), responsavelId: null }));
    const r = distribuir({ modo: 'BALANCEADA', operadores: ['lais', 'graciele'], cursor: 0, clientes });
    expect(Object.fromEntries(r.carga)).toEqual({ lais: 250, graciele: 250 });
  });

  it('MANUAL ou sem operadores não mexe em nada', () => {
    expect(distribuir({ modo: 'MANUAL', operadores: ['a'], cursor: 0, clientes: [{ id: '1', responsavelId: null }] }).atribuicoes.size).toBe(0);
    expect(distribuir({ modo: 'BALANCEADA', operadores: [], cursor: 0, clientes: [{ id: '1', responsavelId: null }] }).atribuicoes.size).toBe(0);
  });
});

describe('relatório disparos × recuperado', () => {
  const usuarios = [
    { id: 'lais', nome: 'Laís', role: 'OPERADOR', ativo: true, carteira: 'Cobrança 1' },
    { id: 'izabel', nome: 'Izabel', role: 'OPERADOR', ativo: true, carteira: 'Cobrança 2' },
    { id: 'admin', nome: 'Antônio', role: 'ADMIN', ativo: true, carteira: null },
  ];
  const r = montarRelatorio({
    de: d('2026-10-01T03:00:00Z'), ate: d('2026-11-01T02:59:59Z'), janelaDias: 7,
    disparos: [
      { origem: 'REGUA', canal: 'NX_SYSTEMS', contaId: 'n1000', operadorId: 'lais', n: 100 },
      { origem: 'MANUAL', canal: 'NX_SYSTEMS', contaId: 'n2000', operadorId: 'lais', n: 20 },
      { origem: 'REGUA', canal: 'EMAIL', contaId: null, operadorId: null, n: 5 },
    ],
    contatadosPorOp: [{ operadorId: 'lais', n: 90 }],
    contatadosTotal: 95,
    recuperados: [
      { origem: 'REGUA', operadorId: 'lais', carteira: 'Cobrança 1', canal: 'NX_SYSTEMS', contaId: 'n1000', dia: '2026-10-10', n: 3, valor: 300 },
      { origem: 'MANUAL', operadorId: 'lais', carteira: 'Cobrança 1', canal: 'NX_SYSTEMS', contaId: 'n2000', dia: '2026-10-10', n: 2, valor: 199.9 },
      { origem: 'SEM_CONTATO', operadorId: null, carteira: null, canal: null, contaId: null, dia: '2026-10-11', n: 1, valor: 99.9 },
    ],
    usuarios,
    carteiras: ['Cobrança 1', 'Cobrança 2'],
    contas: [
      { id: 'n1000', canal: 'NX_SYSTEMS', apelido: 'Aviso', numero: '1000' },
      { id: 'n2000', canal: 'NX_SYSTEMS', apelido: 'Cobrança', numero: '2000' },
    ],
    pendentesAtribuicao: 0,
    clientesPorOp: [{ operadorId: 'lais', n: 40 }],
  });

  it('separa disparos automáticos de manuais', () => {
    expect(r.totais.disparos).toEqual({ total: 125, regua: 105, manual: 20, campanha: 0 });
  });

  it('recuperado por origem, com o total de "com contato" sem contar quem pagou sozinho', () => {
    expect(r.totais.recuperado.REGUA).toEqual({ valor: 300, faturas: 3 });
    expect(r.totais.recuperado.MANUAL).toEqual({ valor: 199.9, faturas: 2 });
    expect(r.totais.recuperadoComContato).toEqual({ valor: 499.9, faturas: 5 });
    expect(r.totais.recebido.valor).toBe(599.8);
  });

  it('linha da operadora junta o que a régua e ela recuperaram para os clientes dela', () => {
    const lais = r.operadores.find((o) => o.id === 'lais')!;
    expect(lais).toMatchObject({ disparosAutomaticos: 100, disparosManuais: 20, clientesContatados: 90, clientesNaCarteira: 40 });
    expect(lais.recuperadoComContato).toEqual({ valor: 499.9, faturas: 5 });
    // Equipe sempre aparece, mesmo zerada; admin sem carteira não.
    expect(r.operadores.some((o) => o.id === 'izabel')).toBe(true);
    expect(r.operadores.some((o) => o.id === 'admin')).toBe(false);
    expect(r.operadores.at(-1)?.nome).toBe('Sem responsável');
  });

  it('por número: mostra apelido · número e quanto cada linha recuperou', () => {
    const l1000 = r.canais.find((c) => c.conta === 'Aviso · 1000')!;
    expect(l1000).toMatchObject({ disparosRegua: 100, faturas: 3, valor: 300 });
  });

  it('série diária por origem', () => {
    expect(r.serie[0]).toEqual({ dia: '2026-10-10', REGUA: 300, MANUAL: 199.9, CAMPANHA: 0, SEM_CONTATO: 0 });
  });
});

describe('rótulo de origem do disparo', () => {
  const base = { campaignId: null, ruleId: 'r', ruleNome: 'Régua', template: null };
  it('manual mostra quem enviou', () => {
    expect(rotuloOrigem({ ...base, origem: 'MANUAL', user: { nome: 'Laís' } })).toBe('Manual · Laís');
  });
  it('régua é automática; disparo antigo sem origem cai na regra antiga', () => {
    expect(rotuloOrigem({ ...base, origem: 'REGUA' })).toBe('Cobrança automática');
    expect(rotuloOrigem({ ...base, origem: null })).toBe('Cobrança automática');
    expect(rotuloOrigem({ campaignId: null, ruleId: null, ruleNome: null, template: 'confirmacao_pagamento' })).toBe('Confirmação de pagamento');
  });
});

import { dividirEmBlocos } from '@/modules/recuperacao/distribuicao';

describe('divisão em blocos (cima/baixo)', () => {
  const lista = (n: number, extra: Record<string, unknown> = {}) =>
    Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, responsavelId: null, ...extra })); // c1 = mais atrasado
  const de = (r: ReturnType<typeof dividirEmBlocos>, op: string) => [...r.atribuicoes].filter(([, o]) => o === op).map(([c]) => c);

  it('duas operadoras: uma fica com a metade de cima, a outra com a de baixo', () => {
    const r = dividirEmBlocos({ operadores: ['lais', 'graciele'], clientes: lista(10), diaIndice: 0 });
    expect(de(r, 'lais')).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(de(r, 'graciele')).toEqual(['c6', 'c7', 'c8', 'c9', 'c10']);
    expect(r.ordemDoDia).toEqual(['lais', 'graciele']);
  });

  it('500 vencidos: 250 para cada', () => {
    const r = dividirEmBlocos({ operadores: ['a', 'b'], clientes: lista(500), diaIndice: 3 });
    expect([r.carga.get('a'), r.carga.get('b')]).toEqual([250, 250]);
  });

  it('o topo reveza a cada dia, e no mesmo dia a divisão é a mesma', () => {
    const dia0 = dividirEmBlocos({ operadores: ['lais', 'graciele'], clientes: lista(6), diaIndice: 0 });
    const dia1 = dividirEmBlocos({ operadores: ['lais', 'graciele'], clientes: lista(6), diaIndice: 1 });
    const dia0b = dividirEmBlocos({ operadores: ['lais', 'graciele'], clientes: lista(6), diaIndice: 0 });
    expect(de(dia0, 'lais')).toEqual(['c1', 'c2', 'c3']);
    expect(de(dia1, 'graciele')).toEqual(['c1', 'c2', 'c3']); // trocou: o topo agora é dela
    expect(de(dia0b, 'lais')).toEqual(de(dia0, 'lais'));
  });

  it('número ímpar: a sobra fica com quem está no topo no dia', () => {
    const r = dividirEmBlocos({ operadores: ['a', 'b'], clientes: lista(5), diaIndice: 0 });
    expect([r.carga.get('a'), r.carga.get('b')]).toEqual([3, 2]);
    expect(de(r, 'b')).toEqual(['c4', 'c5']);
  });

  it('três operadoras: três blocos seguidos, do topo ao fim', () => {
    const r = dividirEmBlocos({ operadores: ['a', 'b', 'c'], clientes: lista(10), diaIndice: 0 });
    expect(de(r, 'a')).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(de(r, 'b')).toEqual(['c5', 'c6', 'c7']);
    expect(de(r, 'c')).toEqual(['c8', 'c9', 'c10']);
  });

  it('cliente fixo (promessa) continua com a dona e o bloco dela encolhe', () => {
    const clientes = [{ id: 'f1', responsavelId: 'b', fixo: true }, { id: 'f2', responsavelId: 'b', fixo: true }, ...lista(8)];
    const r = dividirEmBlocos({ operadores: ['a', 'b'], clientes, diaIndice: 0 });
    expect(r.atribuicoes.get('f1')).toBe('b');
    expect(r.fixos).toBe(2);
    expect([r.carga.get('a'), r.carga.get('b')]).toEqual([5, 5]); // 10 no total: b já tem 2, pega só 3
    expect(de(r, 'a')).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
  });

  it('fixo de quem não é da carteira não vale: entra na divisão', () => {
    const r = dividirEmBlocos({ operadores: ['a', 'b'], clientes: [{ id: 'x', responsavelId: 'outra', fixo: true }, ...lista(3)], diaIndice: 0 });
    expect(r.fixos).toBe(0);
    expect(r.atribuicoes.size).toBe(4);
  });

  it('sem operadoras não faz nada', () => {
    expect(dividirEmBlocos({ operadores: [], clientes: lista(3), diaIndice: 0 }).atribuicoes.size).toBe(0);
  });
});
