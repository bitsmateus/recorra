import { describe, expect, it } from 'vitest';
import { filaDestino, lerMensagemNx, variacoesTelefone } from '@/modules/nx-chat/nx-chat';

// Formato que o NX manda (o mesmo do webhook para o n8n), às vezes embrulhado em `body`.
const cliente = {
  type: 'message_n8n',
  content: { text: 'Oi, quero pagar', fromMe: false, messageId: 'M1' },
  contact: { number: '5511987654321', name: 'Marcos' },
  ticket: { id: 456, userId: null, queueId: 3 },
};

describe('leitura do webhook do NX', () => {
  it('mensagem do cliente: telefone, ticket, fila atual e texto', () => {
    expect(lerMensagemNx(cliente)).toMatchObject({
      tipo: 'cliente', telefone: '5511987654321', ticketId: '456', ticketQueueId: 3, ticketUserId: null, texto: 'Oi, quero pagar',
    });
  });

  it('aceita o payload embrulhado em body (como chega via n8n) e número sem o 9º dígito', () => {
    const m = lerMensagemNx({ body: { ...cliente, contact: { number: '551187654321' } } });
    expect(m.telefone).toBe('5511987654321');
  });

  it('mensagem da atendente (fromMe com usuário no ticket) vira tipo atendente', () => {
    const m = lerMensagemNx({
      ...cliente,
      content: { text: 'Bom dia! Vamos regularizar?', fromMe: true },
      ticket: { id: 456, userId: 12, queueId: 3, user: { id: 12, name: 'Laís', email: 'lais@x.com' } },
    });
    expect(m).toMatchObject({ tipo: 'atendente', ticketUserId: 12, atendenteNome: 'Laís', atendenteEmail: 'lais@x.com' });
  });

  it('mensagem da empresa sem atendente (bot/IA ou API) é ignorada', () => {
    expect(lerMensagemNx({ ...cliente, content: { text: 'aviso', fromMe: true } }).tipo).toBe('ignorar');
  });

  it('mensagem enviada pelo próprio Recorrai (externalKey recorra-) é ignorada', () => {
    const m = lerMensagemNx({ ...cliente, content: { text: 'x', fromMe: true, externalKey: 'recorra-abc' }, ticket: { id: 1, userId: 5 } });
    expect(m.tipo).toBe('ignorar');
  });

  it('grupo, evento sem mensagem e payload sem ticket são ignorados', () => {
    expect(lerMensagemNx({ ...cliente, msg: { remoteJid: '123@g.us' } }).tipo).toBe('ignorar');
    expect(lerMensagemNx({ type: 'status' }).tipo).toBe('ignorar');
    expect(lerMensagemNx({ ...cliente, ticket: {} }).tipo).toBe('ignorar');
  });

  it('formato Baileys (msg.key) também é lido', () => {
    const m = lerMensagemNx({ msg: { key: { remoteJid: '5511987654321@s.whatsapp.net', fromMe: false, id: 'K' }, body: 'oi', ticketId: 9 } });
    expect(m).toMatchObject({ tipo: 'cliente', telefone: '5511987654321', ticketId: '9', texto: 'oi', messageId: 'K' });
  });
});

describe('fila de destino quando o cliente responde', () => {
  const c1 = { id: 'c1', nxQueueId: 10 };
  it('fila pessoal da responsável, se ela é da carteira do cliente', () => {
    expect(filaDestino({ carteira: c1, responsavel: { id: 'u', carteiraId: 'c1', nxQueueId: 77, ativo: true } }))
      .toEqual({ queueId: 77, motivo: 'responsavel' });
  });
  it('responsável de outra carteira (cliente mudou de faixa): vai para a fila da carteira', () => {
    expect(filaDestino({ carteira: c1, responsavel: { id: 'u', carteiraId: 'c2', nxQueueId: 77, ativo: true } }))
      .toEqual({ queueId: 10, motivo: 'carteira' });
  });
  it('responsável sem fila própria ou inativa: fila da carteira', () => {
    expect(filaDestino({ carteira: c1, responsavel: { id: 'u', carteiraId: 'c1', nxQueueId: null, ativo: true } })?.motivo).toBe('carteira');
    expect(filaDestino({ carteira: c1, responsavel: { id: 'u', carteiraId: 'c1', nxQueueId: 77, ativo: false } })?.queueId).toBe(10);
  });
  it('sem fila configurada em lugar nenhum: não transfere', () => {
    expect(filaDestino({ carteira: { id: 'c1', nxQueueId: null }, responsavel: null })).toBeNull();
  });
});

describe('variações de telefone', () => {
  it('com e sem o 9º dígito', () => {
    expect(variacoesTelefone('5511987654321').sort()).toEqual(['551187654321', '5511987654321'].sort());
    expect(variacoesTelefone('551187654321')).toContain('5511987654321');
  });
});
