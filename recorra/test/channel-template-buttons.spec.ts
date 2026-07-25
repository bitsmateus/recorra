import { describe, it, expect, vi, beforeEach } from 'vitest';

// Captura o que cada canal REALMENTE posta para o provedor, sem rede.
const posts: { path: string; body: any }[] = [];
vi.mock('axios', () => {
  const instance = {
    post: (path: string, body: any) => {
      posts.push({ path, body });
      // Respostas no formato de cada provedor (id da mensagem).
      return Promise.resolve({ data: { messages: [{ id: 'wamid.CLOUD' }], ticketId: 'nx-123' } });
    },
  };
  const axios: any = { create: () => instance, isAxiosError: () => false, post: instance.post };
  return { default: axios, ...axios };
});
// safeHttpAgents faz lookup de rede na criação — stub para o teste puro.
vi.mock('@/common/net/safe-http', () => ({ safeHttpAgents: () => ({}) }));

const { NxSystemsChannel } = await import('@/modules/channels/providers/nx-systems.channel');
const { WhatsAppCloudChannel } = await import('@/modules/channels/providers/whatsapp-cloud.channel');
const { resolverBotoesParaEnvio } = await import('@/modules/channels/meta-graph');

beforeEach(() => { posts.length = 0; });

// Simula o que o enqueue faz: mapeamento salvo -> botões resolvidos por cliente.
const cliente = { '{{link}}': 'https://www.asaas.com/i/abc123', '{{pix}}': '00020126BR-PIX' };
const templateButtons = resolverBotoesParaEnvio([
  { index: 0, subType: 'url', token: '{{link}}', urlBase: 'https://www.asaas.com/i/' },
  { index: 1, subType: 'copy_code', token: '{{pix}}' },
], (tok) => (cliente as Record<string, string>)[tok] ?? '');

describe('ponta-a-ponta do payload: mapeamento -> componentes enviados', () => {
  it('resolve para o cliente: URL vira sufixo, Pix vai inteiro', () => {
    expect(templateButtons).toEqual([
      { index: 0, subType: 'url', text: 'abc123' },
      { index: 1, subType: 'copy_code', text: '00020126BR-PIX' },
    ]);
  });

  it('NX Systems (WABA): posta em /templateBody com body + botões', async () => {
    const canal = new NxSystemsChannel({ nxBaseUrl: 'https://webapi.nx/api/x', nxToken: 'tok', nxOficial: true } as any);
    const r = await canal.send({ to: '31999998888', text: '', templateName: 'boleto_vencido', templateLanguage: 'pt_BR', templateParams: ['João', 'R$ 100'], templateButtons });
    expect(r.status).toBe('ENVIADO');
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe('/templateBody');
    const comps = posts[0].body.templateData.template.components;
    expect(comps).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'João' }, { type: 'text', text: 'R$ 100' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'abc123' }] },
      { type: 'button', sub_type: 'copy_code', index: '1', parameters: [{ type: 'coupon_code', coupon_code: '00020126BR-PIX' }] },
    ]);
  });

  it('NX sem body, só botões: ainda usa /templateBody (tem components)', async () => {
    const canal = new NxSystemsChannel({ nxBaseUrl: 'https://webapi.nx/api/x', nxToken: 'tok', nxOficial: true } as any);
    await canal.send({ to: '31999998888', text: '', templateName: 'so_botao', templateParams: [], templateButtons });
    expect(posts[0].path).toBe('/templateBody');
    const comps = posts[0].body.templateData.template.components;
    expect(comps.every((c: any) => c.type === 'button')).toBe(true);
    expect(comps).toHaveLength(2);
  });

  it('WhatsApp Cloud: posta em /messages com body + botões', async () => {
    const canal = new WhatsAppCloudChannel({ phoneId: '123', token: 'tok' } as any);
    const r = await canal.send({ to: '31999998888', text: '', templateName: 'boleto_vencido', templateLanguage: 'pt_BR', templateParams: ['João'], templateButtons });
    expect(r.status).toBe('ENVIADO');
    expect(posts[0].path).toBe('/messages');
    const comps = posts[0].body.template.components;
    expect(comps).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'João' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'abc123' }] },
      { type: 'button', sub_type: 'copy_code', index: '1', parameters: [{ type: 'coupon_code', coupon_code: '00020126BR-PIX' }] },
    ]);
  });

  it('sem botões: nada de componente de botão (compatível com o envio antigo)', async () => {
    const canal = new WhatsAppCloudChannel({ phoneId: '123', token: 'tok' } as any);
    await canal.send({ to: '31999998888', text: '', templateName: 'so_corpo', templateParams: ['João'] });
    const comps = posts[0].body.template.components;
    expect(comps).toEqual([{ type: 'body', parameters: [{ type: 'text', text: 'João' }] }]);
  });

  it('botão com valor vazio é omitido (Meta recusa parâmetro em branco)', async () => {
    const semPix = resolverBotoesParaEnvio([{ index: 1, subType: 'copy_code', token: '{{inexistente}}' }], () => '');
    const canal = new WhatsAppCloudChannel({ phoneId: '123', token: 'tok' } as any);
    await canal.send({ to: '31999998888', text: '', templateName: 't', templateParams: ['João'], templateButtons: semPix });
    const comps = posts[0].body.template.components;
    expect(comps).toEqual([{ type: 'body', parameters: [{ type: 'text', text: 'João' }] }]);
  });
});
