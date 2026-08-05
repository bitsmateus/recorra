import { describe, it, expect } from 'vitest';
import { renderTemplate, money, dateBR } from '@/modules/dunning/template.util';

describe('renderTemplate', () => {
  it('substitui variáveis conhecidas', () => {
    const out = renderTemplate('Oi {{nome}}, sua fatura de {{valor}} vence {{vencimento}}.', {
      nome: 'João',
      valor: 'R$ 99,90',
      vencimento: '10/07/2026',
    });
    expect(out).toBe('Oi João, sua fatura de R$ 99,90 vence 10/07/2026.');
  });

  it('remove variáveis sem valor', () => {
    expect(renderTemplate('Pix: {{pix}}', {})).toBe('Pix: ');
  });

  it('aceita espaços dentro das chaves', () => {
    expect(renderTemplate('{{ nome }}', { nome: 'Ana' })).toBe('Ana');
  });
});

describe('money', () => {
  // Intl usa espaço não separável (U+00A0) entre "R$" e o número; normalizamos.
  const norm = (s: string) => s.replace(/ /g, ' ');
  it('formata em BRL', () => {
    expect(norm(money(99.9))).toBe('R$ 99,90');
    expect(norm(money(1234.5))).toBe('R$ 1.234,50');
  });
});

describe('dateBR', () => {
  it('formata dd/mm/aaaa', () => {
    expect(dateBR(new Date('2026-07-10T12:00:00Z'))).toBe('10/07/2026');
  });
  it('mantem o dia da data gravada a meia-noite UTC (nao volta um dia)', () => {
    expect(dateBR(new Date('2026-08-10T00:00:00Z'))).toBe('10/08/2026');
    expect(dateBR(new Date('2026-08-05T00:00:00Z'))).toBe('05/08/2026');
  });
});
