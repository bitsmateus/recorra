import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyInboundSignature } from '@/modules/inbox/inbound-signature';

/**
 * PoC/regressão — R-06. O webhook inbound não pode processar mensagem forjada.
 */
describe('[R-06] Verificação de webhook inbound', () => {
  it('rejeita inbound forjado sem cabeçalho de autenticação', () => {
    expect(verifyInboundSignature('WHATSAPP_EVOLUTION', { apiKey: 'segredo' }, {}, '')).toBe(false);
    expect(verifyInboundSignature('WHATSAPP_CLOUD', { webhookSecret: 's' }, {}, '{}')).toBe(false);
    expect(verifyInboundSignature('WHATSAPP_UAZAPI', { token: 't' }, {}, '')).toBe(false);
  });

  it('Evolution: aceita quando o header apikey confere', () => {
    expect(verifyInboundSignature('WHATSAPP_EVOLUTION', { apiKey: 'segredo' }, { apikey: 'segredo' }, '')).toBe(true);
    expect(verifyInboundSignature('WHATSAPP_EVOLUTION', { apiKey: 'segredo' }, { apikey: 'errado' }, '')).toBe(false);
  });

  it('Cloud (Meta): aceita apenas com HMAC correto do corpo', () => {
    const secret = 'app-secret';
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '5531999', text: { body: 'oi' } }] } }] }] });
    const sig = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    expect(verifyInboundSignature('WHATSAPP_CLOUD', { webhookSecret: secret }, { 'x-hub-signature-256': sig }, raw)).toBe(true);
    // corpo adulterado -> assinatura não bate
    expect(verifyInboundSignature('WHATSAPP_CLOUD', { webhookSecret: secret }, { 'x-hub-signature-256': sig }, raw + 'x')).toBe(false);
  });

  it('sem segredo configurado é fail-closed', () => {
    expect(verifyInboundSignature('WHATSAPP_CLOUD', {}, { 'x-hub-signature-256': 'sha256=abc' }, '{}')).toBe(false);
  });
});
