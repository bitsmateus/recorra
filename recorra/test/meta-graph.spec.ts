import { describe, it, expect } from 'vitest';
import { sugerirNome, nomeValidoMeta, variaveisDoCorpo, erroMeta } from '../src/modules/channels/meta-graph';

describe('nome do template (regras da Meta)', () => {
  it('tira acentos e pontuação, junta com underscore', () => {
    expect(sugerirNome('Cobrança Atrasada — Ação!')).toBe('cobranca_atrasada_acao');
  });

  it('o nome sugerido é sempre válido para a Meta', () => {
    for (const t of ['Boleto gerado', 'Última chance!', 'Aviso 3 dias', 'ÁÉÍÓÚ ção']) {
      expect(nomeValidoMeta(sugerirNome(t))).toBe(true);
    }
  });

  it('rejeita nome com maiúscula, espaço ou hífen', () => {
    expect(nomeValidoMeta('Boleto')).toBe(false);
    expect(nomeValidoMeta('boleto gerado')).toBe(false);
    expect(nomeValidoMeta('boleto-gerado')).toBe(false);
    expect(nomeValidoMeta('boleto_gerado')).toBe(true);
  });

  it('rejeita nome vazio', () => {
    expect(nomeValidoMeta('')).toBe(false);
  });
});

describe('variáveis do corpo', () => {
  it('extrai na ordem e sem repetir', () => {
    expect(variaveisDoCorpo('Olá {{1}}, valor {{2}} vence {{3}}. Confere {{1}}.')).toEqual([1, 2, 3]);
  });

  it('ordena mesmo fora de sequência', () => {
    expect(variaveisDoCorpo('{{3}} {{1}} {{2}}')).toEqual([1, 2, 3]);
  });

  it('corpo sem variável devolve vazio', () => {
    expect(variaveisDoCorpo('Sem variáveis aqui')).toEqual([]);
  });
});

describe('erroMeta', () => {
  it('traduz token inválido (code 190)', () => {
    const e = { isAxiosError: true, response: { data: { error: { code: 190, message: 'Invalid OAuth token' } } } };
    expect(erroMeta(e)).toContain('Token sem acesso');
  });

  it('traduz falta de permissão (code 200)', () => {
    const e = { isAxiosError: true, response: { data: { error: { code: 200, message: 'Permissions error' } } } };
    expect(erroMeta(e)).toContain('Sem permissão');
  });

  it('prefere a mensagem para o usuário quando a Meta manda', () => {
    const e = { isAxiosError: true, response: { data: { error: { code: 100, message: 'tecnico', error_user_msg: 'Nome já existe' } } } };
    expect(erroMeta(e)).toBe('Nome já existe');
  });
});
