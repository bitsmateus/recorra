import { describe, it, expect } from 'vitest';
import { botoesDeComponents } from '@/modules/channels/meta-graph';

describe('botoesDeComponents — espelha os botões da Meta', () => {
  it('lê quick-reply e URL do componente BUTTONS', () => {
    const comps = [
      { type: 'BODY', text: 'Oi {{1}}' },
      { type: 'BUTTONS', buttons: [
        { type: 'QUICK_REPLY', text: 'Copiar código Pix' },
        { type: 'URL', text: 'Ver Boleto', url: 'https://www.asaas.com/i/{{1}}' },
      ] },
    ];
    expect(botoesDeComponents(comps)).toEqual([
      { tipo: 'QUICK_REPLY', texto: 'Copiar código Pix' },
      { tipo: 'URL', texto: 'Ver Boleto', url: 'https://www.asaas.com/i/{{1}}' },
    ]);
  });

  it('lê botão de telefone', () => {
    const comps = [{ type: 'BUTTONS', buttons: [{ type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+5531999999999' }] }];
    expect(botoesDeComponents(comps)).toEqual([{ tipo: 'PHONE_NUMBER', texto: 'Ligar', telefone: '+5531999999999' }]);
  });

  it('template sem botões devolve lista vazia', () => {
    expect(botoesDeComponents([{ type: 'BODY', text: 'x' }])).toEqual([]);
    expect(botoesDeComponents(undefined)).toEqual([]);
  });

  it('tipo desconhecido não quebra (vira OUTRO)', () => {
    const comps = [{ type: 'BUTTONS', buttons: [{ type: 'CATALOG', text: 'Ver catálogo' }] }];
    expect(botoesDeComponents(comps)).toEqual([{ tipo: 'OUTRO', texto: 'Ver catálogo' }]);
  });
});
