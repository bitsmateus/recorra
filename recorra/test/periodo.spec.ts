import { describe, it, expect } from 'vitest';
import { intervaloDatas, inicioDoMes, chaveMes } from '@/common/util/periodo';

describe('intervaloDatas', () => {
  it('sem datas não filtra nada', () => {
    expect(intervaloDatas()).toBeUndefined();
    expect(intervaloDatas('', '')).toBeUndefined();
  });

  it('ancora as pontas no fuso do tenant, não no do servidor', () => {
    // Independe do TZ de quem roda o teste: a API roda em UTC e o usuário
    // escolheu o dia no calendário dele (São Paulo, UTC-3).
    const r = intervaloDatas('2026-07-01', '2026-07-31')!;
    expect(r.gte!.toISOString()).toBe('2026-07-01T03:00:00.000Z');
    expect(r.lte!.toISOString()).toBe('2026-08-01T02:59:59.999Z');
  });

  it('respeita um fuso diferente do padrão', () => {
    const r = intervaloDatas('2026-07-01', '2026-07-01', 'America/Manaus')!; // UTC-4
    expect(r.gte!.toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(r.lte!.toISOString()).toBe('2026-07-02T03:59:59.999Z');
  });

  it('inclui o dia inteiro do "ate"', () => {
    const r = intervaloDatas('2026-07-16', '2026-07-16')!;
    expect(r.lte!.getTime() - r.gte!.getTime()).toBe(86_400_000 - 1);
  });

  it('aceita só uma das pontas', () => {
    expect(intervaloDatas('2026-07-01')).toEqual({ gte: new Date('2026-07-01T00:00:00.000-03:00') });
    expect(intervaloDatas(undefined, '2026-07-31')).toEqual({ lte: new Date('2026-07-31T23:59:59.999-03:00') });
  });

  it('ignora data inválida em vez de gerar Invalid Date', () => {
    expect(intervaloDatas('nao-e-data')).toBeUndefined();
    expect(intervaloDatas('nao-e-data', '2026-07-31')).toEqual({ lte: new Date('2026-07-31T23:59:59.999-03:00') });
  });

  it('não quebra com fuso inválido no cadastro do tenant', () => {
    const r = intervaloDatas('2026-07-01', undefined, 'Fuso/Inexistente')!;
    expect(r.gte!.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('inicioDoMes', () => {
  it('volta para o dia 1 à meia-noite do fuso do tenant', () => {
    expect(inicioDoMes(new Date('2026-07-16T12:00:00Z')).toISOString()).toBe('2026-07-01T03:00:00.000Z');
  });

  it('usa o mês do calendário local na virada', () => {
    // 1º de agosto 01:00 UTC ainda é 31 de julho, 22h, em São Paulo.
    expect(inicioDoMes(new Date('2026-08-01T01:00:00Z')).toISOString()).toBe('2026-07-01T03:00:00.000Z');
  });
});

describe('chaveMes', () => {
  it('formata YYYY-MM com mês 1-based', () => {
    expect(chaveMes(new Date(2026, 0, 15))).toBe('2026-01');
    expect(chaveMes(new Date(2026, 11, 1))).toBe('2026-12');
  });
});
