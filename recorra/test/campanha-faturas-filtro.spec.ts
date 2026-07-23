import { describe, it, expect } from 'vitest';
import { faturasDaCampanha } from '@/modules/campaigns/campaigns.service';

const REF = new Date('2026-07-22T12:00:00Z');
const vencida = { id: 'v', status: 'VENCIDA', vencimento: new Date('2026-07-20T00:00:00Z') };
const vencidaAntiga = { id: 'va', status: 'VENCIDA', vencimento: new Date('2026-06-01T00:00:00Z') };
const aVencer = { id: 'p', status: 'PENDENTE', vencimento: new Date('2026-08-20T00:00:00Z') };
const abertas = [vencidaAntiga, vencida, aVencer];

describe('faturasDaCampanha', () => {
  it('campanha "com fatura vencida" NÃO inclui a que ainda vai vencer', () => {
    const r = faturasDaCampanha(abertas, { filtroStatus: 'VENCIDA' }, REF);
    expect(r.map((i) => i.id)).toEqual(['va', 'v']);
    expect(r.some((i) => i.status === 'PENDENTE')).toBe(false);
  });

  it('campanha "com fatura a vencer" só manda as pendentes', () => {
    const r = faturasDaCampanha(abertas, { filtroStatus: 'PENDENTE' }, REF);
    expect(r.map((i) => i.id)).toEqual(['p']);
  });

  it('"em aberto" mantém todas', () => {
    expect(faturasDaCampanha(abertas, { filtroStatus: 'ABERTO' }, REF)).toHaveLength(3);
  });

  it('sem filtro de situação mantém todas', () => {
    expect(faturasDaCampanha(abertas, {}, REF)).toHaveLength(3);
  });

  it('"Todos os contatos" ignora o recorte e mantém todas', () => {
    expect(faturasDaCampanha(abertas, { filtroTodos: true, filtroStatus: 'VENCIDA' }, REF)).toHaveLength(3);
  });

  it('atraso mínimo em dias: só as vencidas há pelo menos N dias', () => {
    // 30 dias antes de 22/07 => 22/06. Só a de 01/06 passa.
    const r = faturasDaCampanha(abertas, { filtroDiasAtraso: 30 }, REF);
    expect(r.map((i) => i.id)).toEqual(['va']);
  });

  it('atraso mínimo pequeno pega as duas vencidas, nunca a pendente', () => {
    const r = faturasDaCampanha(abertas, { filtroDiasAtraso: 1 }, REF);
    expect(r.map((i) => i.id)).toEqual(['va', 'v']);
  });

  it('cliente sem fatura na situação filtrada fica sem alvo (não recebe nada)', () => {
    const soPendente = [aVencer];
    expect(faturasDaCampanha(soPendente, { filtroStatus: 'VENCIDA' }, REF)).toHaveLength(0);
  });
});

describe('recorte "vencidas deste mês" (VENCIDA_MES)', () => {
  const REF_MES = new Date('2026-07-22T12:00:00Z'); // julho/2026
  const venceuEsteMes = { id: 'm1', status: 'VENCIDA', vencimento: new Date('2026-07-05T00:00:00Z') };
  const venceuMesPassado = { id: 'm0', status: 'VENCIDA', vencimento: new Date('2026-06-28T00:00:00Z') };
  const aVencerEsteMes = { id: 'p1', status: 'PENDENTE', vencimento: new Date('2026-07-30T00:00:00Z') };

  it('pega só as vencidas com vencimento dentro do mês corrente', () => {
    const r = faturasDaCampanha([venceuMesPassado, venceuEsteMes, aVencerEsteMes], { filtroStatus: 'VENCIDA_MES' }, REF_MES);
    expect(r.map((i) => i.id)).toEqual(['m1']);
  });

  it('não confunde com "todas as vencidas"', () => {
    const r = faturasDaCampanha([venceuMesPassado, venceuEsteMes], { filtroStatus: 'VENCIDA' }, REF_MES);
    expect(r.map((i) => i.id)).toEqual(['m0', 'm1']);
  });

  it('inclui o vencimento no dia 1º do mês (borda)', () => {
    const dia1 = { id: 'd1', status: 'VENCIDA', vencimento: new Date('2026-07-01T00:00:00Z') };
    const r = faturasDaCampanha([dia1], { filtroStatus: 'VENCIDA_MES' }, REF_MES);
    expect(r.map((i) => i.id)).toEqual(['d1']);
  });
});
