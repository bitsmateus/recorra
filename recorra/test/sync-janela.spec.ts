import { describe, it, expect } from 'vitest';
import { dataCorte, dentroDaJanela, DIAS_HISTORICO_PADRAO } from '@/modules/connectors/sync-janela';

const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);
const REF = dia('2026-08-03');

describe('dataCorte', () => {
  it('volta N dias a partir do dia de referência (meia-noite UTC)', () => {
    expect(dataCorte(90, REF).toISOString()).toBe('2026-05-05T00:00:00.000Z');
  });

  it('normaliza para o dia: a hora da referência não desloca o corte', () => {
    const tarde = new Date('2026-08-03T23:59:59.000Z');
    expect(dataCorte(30, tarde)!.getTime()).toBe(dataCorte(30, REF)!.getTime());
  });

  it('sem janela configurada não há corte', () => {
    expect(dataCorte(null, REF)).toBeNull();
    expect(dataCorte(undefined, REF)).toBeNull();
  });

  it('valor inválido não vira corte silencioso (barraria cobrança boa)', () => {
    expect(dataCorte(-1, REF)).toBeNull();
    expect(dataCorte(Number.NaN, REF)).toBeNull();
  });

  it('janela 0 corta tudo que venceu antes de hoje', () => {
    expect(dataCorte(0, REF)!.toISOString()).toBe('2026-08-03T00:00:00.000Z');
  });
});

describe('dentroDaJanela', () => {
  const corte = dataCorte(DIAS_HISTORICO_PADRAO, REF)!; // 2026-05-05

  it('deixa entrar o que venceu depois do corte', () => {
    expect(dentroDaJanela(dia('2026-07-28'), corte)).toBe(true);
  });

  it('deixa entrar quem vence no futuro (fatura a vencer)', () => {
    expect(dentroDaJanela(dia('2026-09-10'), corte)).toBe(true);
  });

  it('o próprio dia do corte entra (borda inclusiva)', () => {
    expect(dentroDaJanela(dia('2026-05-05'), corte)).toBe(true);
  });

  it('barra o passivo histórico', () => {
    expect(dentroDaJanela(dia('2026-05-04'), corte)).toBe(false);
    expect(dentroDaJanela(dia('2022-03-15'), corte)).toBe(false); // vencida há ~4 anos
  });

  it('sem corte, tudo entra (comportamento antigo preservado)', () => {
    expect(dentroDaJanela(dia('2019-01-01'), null)).toBe(true);
  });

  it('vencimento ilegível entra: descartar por data quebrada esconderia cobrança', () => {
    expect(dentroDaJanela(new Date('nao-e-data'), corte)).toBe(true);
  });
});
