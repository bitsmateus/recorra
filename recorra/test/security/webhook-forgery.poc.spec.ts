import { describe, it, expect } from 'vitest';
import { EfiProvider } from '@/modules/payments/providers/efi.provider';
import { AsaasProvider } from '@/modules/payments/providers/asaas.provider';
import { StripeProvider } from '@/modules/payments/providers/stripe.provider';

/**
 * PoC de segurança — Fase 8.
 * Estes testes descrevem o COMPORTAMENTO SEGURO esperado. Eles FALHAM hoje
 * (comprovando os achados F3-1 e F3-2) e devem PASSAR após a correção.
 *
 * Correção esperada:
 *  - Efí: verificar mTLS/assinatura ou reconfirmar via getChargeStatus.
 *  - Asaas/Stripe/MP: fail-CLOSED — sem segredo configurado, webhook é inválido.
 */
describe('[F3-1] Webhook Efí não pode aceitar "pago" forjado', () => {
  it('deve marcar como INVÁLIDO um webhook sem verificação de origem', () => {
    const efi = new EfiProvider({ apiKey: 'id:secret' } as never);
    const forjado = { pix: [{ txid: 'qualquer-txid', horario: '2026-07-15T10:00:00Z' }] };

    const r = efi.parseWebhook({}, forjado);

    // Hoje retorna valid:true (fraude). O esperado seguro é false.
    expect(r.valid).toBe(false);
  });
});

describe('[F3-2] Verificação de assinatura deve ser fail-closed', () => {
  it('Asaas: sem webhookToken configurado, webhook não pode ser válido', () => {
    const asaas = new AsaasProvider({ apiKey: 'x' } as never); // sem webhookToken
    const r = asaas.parseWebhook(
      {}, // sem header asaas-access-token
      { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', status: 'RECEIVED' } },
    );
    expect(r.valid).toBe(false);
  });

  it('Stripe: sem webhookSecret configurado, webhook não pode ser válido', () => {
    const stripe = new StripeProvider({ apiKey: 'sk_test' } as never); // sem webhookToken
    const r = stripe.parseWebhook(
      {}, // sem stripe-signature
      { type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', status: 'succeeded' } } },
      JSON.stringify({ any: 'body' }),
    );
    expect(r.valid).toBe(false);
  });
});
