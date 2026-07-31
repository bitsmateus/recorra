import { describe, it, expect } from 'vitest';
import { botoesDeComponents, botoesDinamicos, sufixoUrlDinamica, botoesComponents, erroMapeamentoBotoes } from '@/modules/channels/meta-graph';

describe('erroMapeamentoBotoes — barra o botão de URL com link do ERP', () => {
  const url = (token: string) => [{ index: 0, subType: 'url' as const, token }];

  it('recusa os tokens que rendem URL inteira do ERP', () => {
    for (const t of ['{{link}}', '{{linkPagamento}}', '{{pagamento}}', '{{boleto}}', '{{ link }}']) {
      expect(erroMapeamentoBotoes(url(t))).toMatch(/domínio fixo|Página de pagamento/i);
    }
  });

  it('aceita {{pagina}} — é só o token, o sufixo que a Meta espera', () => {
    expect(erroMapeamentoBotoes(url('{{pagina}}'))).toBeNull();
  });

  it('recusa valor longo no botão de copiar código (cupom da Meta)', () => {
    // Confirmado em produção: com {{pix}} a Meta devolve #132018; com um valor
    // curto (CPF) o mesmo template passa.
    for (const t of ['{{pix}}', '{{pagina}}', '{{link}}', '{{boleto}}']) {
      expect(erroMapeamentoBotoes([{ index: 1, subType: 'copy_code', token: t }])).toMatch(/código curto|cupom/i);
    }
  });

  it('aceita valor curto no botão de copiar código', () => {
    expect(erroMapeamentoBotoes([{ index: 1, subType: 'copy_code', token: '{{documento}}' }])).toBeNull();
    expect(erroMapeamentoBotoes([{ index: 1, subType: 'copy_code', token: '{{contrato}}' }])).toBeNull();
  });

  it('cada tipo de botão tem a sua restrição, não a do outro', () => {
    // {{pagina}} serve no link, não no cupom; {{documento}} serve nos dois.
    expect(erroMapeamentoBotoes(url('{{pagina}}'))).toBeNull();
    expect(erroMapeamentoBotoes([{ index: 1, subType: 'copy_code', token: '{{pagina}}' }])).not.toBeNull();
    expect(erroMapeamentoBotoes(url('{{documento}}'))).toBeNull();
  });

  it('sem botões / token vazio não reclama', () => {
    expect(erroMapeamentoBotoes([])).toBeNull();
    expect(erroMapeamentoBotoes(undefined)).toBeNull();
    expect(erroMapeamentoBotoes(url(''))).toBeNull();
  });
});

describe('botoesDeComponents — espelha os botões da Meta', () => {
  it('lê quick-reply e URL, com index e se é dinâmico', () => {
    const comps = [
      { type: 'BODY', text: 'Oi {{1}}' },
      { type: 'BUTTONS', buttons: [
        { type: 'QUICK_REPLY', text: 'Copiar código Pix' },
        { type: 'URL', text: 'Ver Boleto', url: 'https://www.asaas.com/i/{{1}}' },
      ] },
    ];
    expect(botoesDeComponents(comps)).toEqual([
      { tipo: 'QUICK_REPLY', texto: 'Copiar código Pix', index: 0, dinamico: false },
      { tipo: 'URL', texto: 'Ver Boleto', url: 'https://www.asaas.com/i/{{1}}', index: 1, dinamico: true },
    ]);
  });

  it('URL fixa (sem {{}}) não é dinâmica; COPY_CODE é', () => {
    const comps = [{ type: 'BUTTONS', buttons: [
      { type: 'URL', text: 'Site', url: 'https://recorrai.com.br' },
      { type: 'COPY_CODE', text: 'Copiar' },
    ] }];
    const r = botoesDeComponents(comps);
    expect(r[0]).toMatchObject({ tipo: 'URL', dinamico: false, index: 0 });
    expect(r[1]).toMatchObject({ tipo: 'COPY_CODE', dinamico: true, index: 1 });
  });

  it('lê botão de telefone (não dinâmico)', () => {
    const comps = [{ type: 'BUTTONS', buttons: [{ type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+5531999999999' }] }];
    expect(botoesDeComponents(comps)).toEqual([{ tipo: 'PHONE_NUMBER', texto: 'Ligar', telefone: '+5531999999999', index: 0, dinamico: false }]);
  });

  it('template sem botões devolve lista vazia', () => {
    expect(botoesDeComponents([{ type: 'BODY', text: 'x' }])).toEqual([]);
    expect(botoesDeComponents(undefined)).toEqual([]);
  });

  it('tipo desconhecido não quebra (vira OUTRO, não dinâmico)', () => {
    const comps = [{ type: 'BUTTONS', buttons: [{ type: 'CATALOG', text: 'Ver catálogo' }] }];
    expect(botoesDeComponents(comps)).toEqual([{ tipo: 'OUTRO', texto: 'Ver catálogo', index: 0, dinamico: false }]);
  });
});

describe('botoesDinamicos — só os que precisam de valor no envio', () => {
  it('filtra quick-reply/telefone/url-fixa e mantém url-dinâmica e copy-code', () => {
    const botoes = botoesDeComponents([{ type: 'BUTTONS', buttons: [
      { type: 'QUICK_REPLY', text: 'Falar' },
      { type: 'URL', text: 'Boleto', url: 'https://x.com/{{1}}' },
      { type: 'COPY_CODE', text: 'Pix' },
    ] }]);
    expect(botoesDinamicos(botoes).map((b) => b.texto)).toEqual(['Boleto', 'Pix']);
    expect(botoesDinamicos(null)).toEqual([]);
  });
});

describe('sufixoUrlDinamica — Meta só aceita o sufixo, não a URL inteira', () => {
  it('tira a base do template quando o valor é a URL completa', () => {
    expect(sufixoUrlDinamica('https://www.asaas.com/i/{{1}}', 'https://www.asaas.com/i/abc123')).toBe('abc123');
  });
  it('valor que não bate com a base vai como veio (melhor esforço)', () => {
    expect(sufixoUrlDinamica('https://pay.com/{{1}}', 'abc123')).toBe('abc123');
  });
  it('sem URL de template, devolve o valor', () => {
    expect(sufixoUrlDinamica(undefined, 'https://x.com/y')).toBe('https://x.com/y');
  });
});

describe('botoesComponents — payload de envio da Meta', () => {
  it('monta url (text) e copy_code (coupon_code) com index string', () => {
    expect(botoesComponents([
      { index: 1, subType: 'url', text: 'abc123' },
      { index: 2, subType: 'copy_code', text: '00020126...pix' },
    ])).toEqual([
      { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'abc123' }] },
      { type: 'button', sub_type: 'copy_code', index: '2', parameters: [{ type: 'coupon_code', coupon_code: '00020126...pix' }] },
    ]);
  });
  it('omite botão com valor vazio (a Meta recusa parâmetro em branco)', () => {
    expect(botoesComponents([{ index: 0, subType: 'url', text: '  ' }])).toEqual([]);
    expect(botoesComponents(null)).toEqual([]);
  });
});

import { resolverBotoesParaEnvio } from '@/modules/channels/meta-graph';

describe('resolverBotoesParaEnvio — mapeamento → parâmetros do cliente', () => {
  const vars: Record<string, string> = { '{{link}}': 'https://www.asaas.com/i/abc123', '{{pix}}': '00020126PIXCODE' };
  const render = (tok: string) => vars[tok] ?? '';

  it('URL manda só o sufixo; copy_code manda o valor inteiro', () => {
    const r = resolverBotoesParaEnvio([
      { index: 1, subType: 'url', token: '{{link}}', urlBase: 'https://www.asaas.com/i/' },
      { index: 2, subType: 'copy_code', token: '{{pix}}' },
    ], render);
    expect(r).toEqual([
      { index: 1, subType: 'url', text: 'abc123' },
      { index: 2, subType: 'copy_code', text: '00020126PIXCODE' },
    ]);
  });

  it('token não mapeado vira vazio (o envio depois descarta)', () => {
    const r = resolverBotoesParaEnvio([{ index: 0, subType: 'copy_code', token: '{{inexistente}}' }], render);
    expect(r).toEqual([{ index: 0, subType: 'copy_code', text: '' }]);
  });

  it('lista vazia/nula devolve vazio', () => {
    expect(resolverBotoesParaEnvio(null, render)).toEqual([]);
  });
});

import { componenteBotoesCriacao } from '@/modules/channels/meta-graph';

describe('componenteBotoesCriacao — criar template com botões na Meta', () => {
  it('URL dinâmica: url com {{1}} e example com a base + exemplo', () => {
    const c = componenteBotoesCriacao([{ tipo: 'URL', texto: 'Ver boleto', urlBase: 'https://www.asaas.com/i/', dinamica: true, exemplo: 'abc123' }]);
    expect(c).toEqual({ type: 'BUTTONS', buttons: [
      { type: 'URL', text: 'Ver boleto', url: 'https://www.asaas.com/i/{{1}}', example: ['https://www.asaas.com/i/abc123'] },
    ] });
  });

  it('COPY_CODE tem example e não tem text; quick reply tem só text', () => {
    const c = componenteBotoesCriacao([
      { tipo: 'COPY_CODE', exemplo: '00020126PIX' },
      { tipo: 'QUICK_REPLY', texto: 'Falar com atendente' },
    ]) as any;
    // A Meta exige o example como STRING (não array) e alfanumérico curto.
    expect(c.buttons[0]).toEqual({ type: 'COPY_CODE', example: '00020126PIX' });
    expect(c.buttons[1]).toEqual({ type: 'QUICK_REPLY', text: 'Falar com atendente' });
  });

  it('URL fixa (não dinâmica) manda só a url, sem example', () => {
    const c = componenteBotoesCriacao([{ tipo: 'URL', texto: 'Site', urlBase: 'https://recorrai.com.br' }]) as any;
    expect(c.buttons[0]).toEqual({ type: 'URL', text: 'Site', url: 'https://recorrai.com.br' });
  });

  it('rótulo é cortado em 25 caracteres (limite da Meta)', () => {
    const c = componenteBotoesCriacao([{ tipo: 'QUICK_REPLY', texto: 'x'.repeat(40) }]) as any;
    expect(c.buttons[0].text.length).toBe(25);
  });

  it('sem botões devolve null', () => {
    expect(componenteBotoesCriacao([])).toBeNull();
    expect(componenteBotoesCriacao(undefined)).toBeNull();
  });
});
