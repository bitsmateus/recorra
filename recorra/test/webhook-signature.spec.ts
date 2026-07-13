import { describe, it, expect } from 'vitest';
import { hmacSha256, safeEqualHex, verifyStripeSignature, verifyMercadoPagoSignature } from '@/modules/payments/webhook-signature';

const secret = 'whsec_test_secret';

describe('safeEqualHex', () => {
  it('compara hex iguais/diferentes', () => {
    expect(safeEqualHex('abcd', 'abcd')).toBe(true);
    expect(safeEqualHex('abcd', 'abce')).toBe(false);
    expect(safeEqualHex('abcd', 'ab')).toBe(false);
  });
});

describe('Stripe signature', () => {
  const raw = '{"id":"evt_1","type":"payment_intent.succeeded"}';
  const t = 1_800_000_000;
  const validSig = hmacSha256(`${t}.${raw}`, secret);

  it('aceita assinatura válida dentro da tolerância', () => {
    const header = `t=${t},v1=${validSig}`;
    expect(verifyStripeSignature(raw, header, secret, 300, t + 10)).toBe(true);
  });
  it('rejeita assinatura adulterada', () => {
    const header = `t=${t},v1=${'0'.repeat(validSig.length)}`;
    expect(verifyStripeSignature(raw, header, secret, 300, t + 10)).toBe(false);
  });
  it('rejeita fora da tolerância de tempo (replay)', () => {
    const header = `t=${t},v1=${validSig}`;
    expect(verifyStripeSignature(raw, header, secret, 300, t + 1000)).toBe(false);
  });
  it('rejeita body alterado', () => {
    const header = `t=${t},v1=${validSig}`;
    expect(verifyStripeSignature(raw + 'x', header, secret, 300, t + 10)).toBe(false);
  });
});

describe('Mercado Pago signature', () => {
  const requestId = 'req-123';
  const dataId = '99999';
  const ts = '1700000000';
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = hmacSha256(manifest, secret);

  it('aceita assinatura válida', () => {
    expect(verifyMercadoPagoSignature(`ts=${ts},v1=${v1}`, requestId, dataId, secret)).toBe(true);
  });
  it('rejeita se o dataId não bate', () => {
    expect(verifyMercadoPagoSignature(`ts=${ts},v1=${v1}`, requestId, 'outro', secret)).toBe(false);
  });
});
