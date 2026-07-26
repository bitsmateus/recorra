import { describe, it, expect } from 'vitest';
import { referenciaPix } from '@/modules/dunning/dunning.service';

describe('referenciaPix — quando a régua precisa buscar o Pix no gateway', () => {
  it('detecta {{pix}} no corpo do template', () => {
    expect(referenciaPix('Pix: {{pix}}')).toBe(true);
  });
  it('detecta {{pix}} num parâmetro de template (posicional)', () => {
    expect(referenciaPix('[template]', null, '{{nome}}', '{{pix}}')).toBe(true);
  });
  it('detecta {{pix}} dentro do JSON dos botões (token do botão)', () => {
    const botoes = JSON.stringify([{ index: 1, subType: 'copy_code', token: '{{pix}}' }]);
    expect(referenciaPix('oi', botoes)).toBe(true);
  });
  it('aceita espaços e maiúsculas ({{ PIX }})', () => {
    expect(referenciaPix('{{ PIX }}')).toBe(true);
  });
  it('sem {{pix}} retorna false (não busca à toa)', () => {
    expect(referenciaPix('Olá {{nome}}, valor {{valor}}', '{{link}}')).toBe(false);
    expect(referenciaPix(null, undefined, '')).toBe(false);
  });
});
