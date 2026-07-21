import { describe, it, expect } from 'vitest';
import { wherePorSituacao } from '@/modules/campaigns/campaigns.service';

describe('wherePorSituacao (filtro de público por situação da cobrança)', () => {
  it('VENCIDA: tem alguma fatura vencida em gestão ativa', () => {
    expect(wherePorSituacao('VENCIDA')).toEqual({ invoices: { some: { status: 'VENCIDA', gestaoCobranca: 'ATIVA' } } });
  });

  it('PENDENTE: tem alguma fatura pendente em gestão ativa', () => {
    expect(wherePorSituacao('PENDENTE')).toEqual({ invoices: { some: { status: 'PENDENTE', gestaoCobranca: 'ATIVA' } } });
  });

  it('ABERTO: tem fatura pendente OU vencida', () => {
    expect(wherePorSituacao('ABERTO')).toEqual({
      invoices: { some: { status: { in: ['PENDENTE', 'VENCIDA'] }, gestaoCobranca: 'ATIVA' } },
    });
  });

  it('EM_DIA: não tem nenhuma fatura em aberto', () => {
    expect(wherePorSituacao('EM_DIA')).toEqual({
      invoices: { none: { status: { in: ['PENDENTE', 'VENCIDA'] }, gestaoCobranca: 'ATIVA' } },
    });
  });

  it('valor inválido/ausente não gera filtro', () => {
    expect(wherePorSituacao(null)).toEqual({});
    expect(wherePorSituacao(undefined)).toEqual({});
    expect(wherePorSituacao('QUALQUER_COISA')).toEqual({});
  });
});
