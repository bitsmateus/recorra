import { describe, it, expect } from 'vitest';
import { categorizeTemplate, isCobrancaButMarketing } from '@/modules/channels/template-category';
import { detectIntent, buildBotReply } from '@/modules/inbox/negotiation';

describe('categorizeTemplate', () => {
  it('cobrança comum é utility', () => {
    expect(categorizeTemplate('Sua fatura de R$ 99,90 vence hoje. Pix: ...')).toBe('UTILITY');
  });
  it('código/OTP é authentication', () => {
    expect(categorizeTemplate('Seu código de verificação é 123456')).toBe('AUTHENTICATION');
  });
  it('promoção é marketing', () => {
    expect(categorizeTemplate('Aproveite nosso desconto especial de Black Friday!')).toBe('MARKETING');
  });
  it('alerta quando cobrança cai em marketing', () => {
    expect(isCobrancaButMarketing('Sua fatura está em aberto! Aproveite o desconto imperdível')).toBe(true);
    expect(isCobrancaButMarketing('Sua fatura vence hoje. Pix: ...')).toBe(false);
  });
});

describe('chatbot — detectIntent', () => {
  it('reconhece intenção de pagar', () => {
    expect(detectIntent('quero pagar agora')).toBe('PAGAR');
  });
  it('reconhece negociação', () => {
    expect(detectIntent('dá pra parcelar em 3x?')).toBe('NEGOCIAR');
  });
  it('reconhece contestação', () => {
    expect(detectIntent('não reconheço essa cobrança')).toBe('CONTESTAR');
  });
  it('reconhece opt-out', () => {
    expect(detectIntent('não quero receber mais, me tira daqui')).toBe('PARAR');
  });
  it('reconhece segunda via', () => {
    expect(detectIntent('me manda o pix de novo')).toBe('SEGUNDA_VIA');
  });
});

describe('chatbot — buildBotReply', () => {
  it('pagar dispara envio do Pix', () => {
    const a = buildBotReply('quero pagar', { nome: 'João', pix: '000...', valor: 'R$ 99,90' });
    expect(a.intent).toBe('PAGAR');
    expect(a.enviarPix).toBe(true);
    expect(a.reply).toContain('João');
  });
  it('negociar abre acordo quando permitido', () => {
    const a = buildBotReply('quero parcelar', { permiteAcordo: true, descontoMax: 20 });
    expect(a.abrirAcordo).toBe(true);
  });
  it('contestar marca a fatura e encaminha', () => {
    const a = buildBotReply('não reconheço', {});
    expect(a.marcarContestada).toBe(true);
    expect(a.encaminharHumano).toBe(true);
  });
  it('parar registra opt-out', () => {
    const a = buildBotReply('parar', {});
    expect(a.registrarOptOut).toBe(true);
  });
});
