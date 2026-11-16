import { describe, expect, it } from 'vitest';
import { telasEfetivas, telasPadrao, somenteProprios } from '@/common/auth/telas';

describe('telas por pessoa', () => {
  it('operador por padrão nunca vê configurações, réguas, cobranças gerais nem relatórios', () => {
    const t = telasPadrao('OPERADOR');
    expect(t).toEqual(['dashboard', 'clientes', 'esteira', 'disparos']);
    for (const proibida of ['cobrancas', 'reguas', 'relatorios', 'canais', 'equipe', 'integracoes', 'campanhas']) expect(t).not.toContain(proibida);
  });
  it('administrador vê tudo por padrão', () => {
    expect(telasPadrao('ADMIN')).toContain('relatorios');
    expect(telasPadrao('ADMIN')).toContain('equipe');
  });
  it('personalizado vale no lugar do padrão (e ignora tela desconhecida)', () => {
    expect(telasEfetivas({ role: 'OPERADOR', telasCustom: true, telas: ['esteira', 'relatorios', 'xpto'] })).toEqual(['esteira', 'relatorios']);
    expect(telasEfetivas({ role: 'ADMIN', telasCustom: true, telas: ['clientes'] })).toEqual(['clientes']);
  });
  it('sem personalização, a lista salva é ignorada', () => {
    expect(telasEfetivas({ role: 'OPERADOR', telasCustom: false, telas: ['relatorios'] })).not.toContain('relatorios');
  });
  it('dono da conta sempre vê tudo', () => {
    expect(telasEfetivas({ role: 'OWNER', telasCustom: true, telas: [] })).toContain('equipe');
  });
  it('operador e leitura veem só os próprios dados', () => {
    expect(somenteProprios('OPERADOR')).toBe(true);
    expect(somenteProprios('LEITURA')).toBe(true);
    expect(somenteProprios('FINANCEIRO')).toBe(false);
  });
});
