import { describe, it, expect } from 'vitest';
import { condicaoFalta } from '@/modules/customers/customers.service';

/** Avalia o `where` do Prisma contra um cliente em memória (só os operadores usados aqui). */
function bate(cond: any, cli: { telefone: string | null; email: string | null }): boolean {
  if (cond.AND) return cond.AND.every((c: any) => bate(c, cli));
  if (cond.OR) return cond.OR.some((c: any) => bate(c, cli));
  const campo = 'telefone' in cond ? 'telefone' : 'email';
  return cli[campo as 'telefone' | 'email'] === cond[campo];
}

const completo = { telefone: '11999998888', email: 'a@b.com' };
const soTelefone = { telefone: '11999998888', email: null };
const soEmail = { telefone: null, email: 'a@b.com' };
const semNada = { telefone: null, email: null };
const vazioString = { telefone: '', email: '' }; // o ERP às vezes manda string vazia

describe('condicaoFalta — recorte do cadastro incompleto', () => {
  it('sem telefone: pega quem não tem telefone (inclusive string vazia)', () => {
    const c = condicaoFalta('telefone');
    expect(bate(c, soEmail)).toBe(true);
    expect(bate(c, semNada)).toBe(true);
    expect(bate(c, vazioString)).toBe(true);
    expect(bate(c, soTelefone)).toBe(false);
    expect(bate(c, completo)).toBe(false);
  });

  it('sem e-mail: pega quem não tem e-mail', () => {
    const c = condicaoFalta('email');
    expect(bate(c, soTelefone)).toBe(true);
    expect(bate(c, semNada)).toBe(true);
    expect(bate(c, completo)).toBe(false);
    expect(bate(c, soEmail)).toBe(false);
  });

  it('ambos: só quem não tem nenhum contato (não recebe por canal nenhum)', () => {
    const c = condicaoFalta('ambos');
    expect(bate(c, semNada)).toBe(true);
    expect(bate(c, vazioString)).toBe(true);
    expect(bate(c, soTelefone)).toBe(false);
    expect(bate(c, soEmail)).toBe(false);
    expect(bate(c, completo)).toBe(false);
  });

  it('sem recorte: qualquer campo faltando entra; cadastro completo fica de fora', () => {
    const c = condicaoFalta(undefined);
    expect(bate(c, soTelefone)).toBe(true);
    expect(bate(c, soEmail)).toBe(true);
    expect(bate(c, semNada)).toBe(true);
    expect(bate(c, completo)).toBe(false);
  });

  it('valor desconhecido cai no comportamento padrão (qualquer um)', () => {
    const c = condicaoFalta('qualquercoisa');
    expect(bate(c, soEmail)).toBe(true);
    expect(bate(c, completo)).toBe(false);
  });
});
