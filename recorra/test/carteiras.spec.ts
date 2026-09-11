import { describe, expect, it } from 'vitest';
import { carteiraDaFaixa } from '@/modules/dunning/carteiras';

describe('carteiraDaFaixa — carteiras configuráveis por tenant', () => {
  const carteiras = [
    { id: '1', nome: 'Equipe 1', diaMinimo: 5 },
    { id: '2', nome: 'Retenção', diaMinimo: 30 },
  ];

  it('sem nenhuma carteira cadastrada, ninguém assume (null)', () => {
    expect(carteiraDaFaixa(10, [])).toBeNull();
  });

  it('atraso menor que o diaMinimo de todas as carteiras: null (ninguém assumiu ainda)', () => {
    expect(carteiraDaFaixa(2, carteiras)).toBeNull();
  });

  it('cai na carteira de menor diaMinimo quando está na faixa dela', () => {
    expect(carteiraDaFaixa(5, carteiras)?.nome).toBe('Equipe 1');
    expect(carteiraDaFaixa(29, carteiras)?.nome).toBe('Equipe 1');
  });

  it('passa para a próxima carteira ao cruzar o diaMinimo dela', () => {
    expect(carteiraDaFaixa(30, carteiras)?.nome).toBe('Retenção');
    expect(carteiraDaFaixa(200, carteiras)?.nome).toBe('Retenção');
  });

  it('funciona com 3+ carteiras e ordem de entrada arbitrária', () => {
    const tres = [
      { id: 'c', nome: 'C', diaMinimo: 60 },
      { id: 'a', nome: 'A', diaMinimo: 5 },
      { id: 'b', nome: 'B', diaMinimo: 20 },
    ];
    expect(carteiraDaFaixa(10, tres)?.nome).toBe('A');
    expect(carteiraDaFaixa(25, tres)?.nome).toBe('B');
    expect(carteiraDaFaixa(90, tres)?.nome).toBe('C');
  });
});
