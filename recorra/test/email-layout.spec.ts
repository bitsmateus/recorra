import { describe, it, expect } from 'vitest';
import { renderEmail, primeiraUrl, escapeHtml } from '../src/modules/channels/email-layout';
import { preencherExemplo } from '../src/modules/channels/email-templates.service';

describe('email-layout', () => {
  it('usa o assunto e o corpo informados', () => {
    const html = renderEmail({ assunto: 'Sua fatura', texto: 'Olá João' }, { empresa: 'Acme' });
    expect(html).toContain('<title>Sua fatura</title>');
    expect(html).toContain('Olá João');
    expect(html).toContain('Acme');
  });

  it('escapa HTML do corpo (o texto vem do usuário)', () => {
    const html = renderEmail({ assunto: 'x', texto: '<script>alert(1)</script>' }, {});
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapa o nome da empresa', () => {
    const html = renderEmail({ assunto: 'x', texto: 'y' }, { empresa: '<b>Acme</b>' });
    expect(html).not.toContain('<b>Acme</b>');
  });

  it('vira botão quando o texto tem link', () => {
    const html = renderEmail({ assunto: 'x', texto: 'Pague: https://pag.exemplo.com/f/1', botaoUrl: 'https://pag.exemplo.com/f/1' }, {});
    expect(html).toContain('href="https://pag.exemplo.com/f/1"');
    expect(html).toContain('Pagar agora');
  });

  it('não gera botão sem link', () => {
    const html = renderEmail({ assunto: 'x', texto: 'Sem link aqui' }, {});
    expect(html).not.toContain('Pagar agora');
  });

  it('link sozinho na linha vira só o botão, sem repetir a URL no corpo', () => {
    const url = 'https://pag.exemplo.com/f/1';
    const html = renderEmail({ assunto: 'x', texto: `Pague aqui:\n\n${url}\n\nObrigado.`, botaoUrl: url }, {});
    expect(html).toContain('Pagar agora');
    expect(html).toContain('Obrigado.');
    // A URL aparece uma vez só — no href do botão, não como texto do corpo.
    expect(html.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
  });

  it('link no meio da frase continua no corpo', () => {
    const url = 'https://pag.exemplo.com/f/1';
    const html = renderEmail({ assunto: 'x', texto: `Acesse ${url} para pagar.`, botaoUrl: url }, {});
    expect(html).toContain('para pagar.');
    expect(html).toContain(`<a href="${url}"`);
  });

  it('rejeita cor inválida e cai no padrão', () => {
    expect(renderEmail({ assunto: 'x', texto: 'y' }, { cor: 'javascript:alert(1)' })).toContain('#14857C');
    expect(renderEmail({ assunto: 'x', texto: 'y' }, { cor: '#ABC' })).toContain('#ABC');
  });

  it('ignora logo e botão que não sejam http(s)', () => {
    const html = renderEmail({ assunto: 'x', texto: 'y', botaoUrl: 'javascript:alert(1)' }, { logoUrl: 'javascript:alert(1)' });
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Pagar agora');
  });

  it('quebra de linha vira <br>', () => {
    expect(renderEmail({ assunto: 'x', texto: 'a\nb' }, {})).toContain('a<br>b');
  });

  it('escapeHtml cobre os cinco caracteres', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});

describe('primeiraUrl', () => {
  it('acha a primeira URL do texto', () => {
    expect(primeiraUrl('pague em https://a.com/1 ou https://b.com/2')).toBe('https://a.com/1');
  });
  it('devolve null sem URL', () => {
    expect(primeiraUrl('sem link')).toBeNull();
  });
});

describe('preencherExemplo', () => {
  it('troca variáveis conhecidas por exemplos', () => {
    expect(preencherExemplo('Olá {{nome}}, {{valor}}')).toBe('Olá João Silva, R$ 149,90');
  });
  it('mantém variável desconhecida visível', () => {
    expect(preencherExemplo('{{inexistente}}')).toBe('{{inexistente}}');
  });
});
