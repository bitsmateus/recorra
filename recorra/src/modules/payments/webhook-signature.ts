import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificação de assinatura de webhooks — puro e testável.
 * Evita que qualquer um POSTe um "pagamento confirmado" falso.
 */

/** Compara dois hex em tempo constante (evita timing attacks). */
export function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** HMAC-SHA256 hex de um payload com o segredo. */
export function hmacSha256(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Stripe: header `Stripe-Signature: t=<ts>,v1=<sig>`.
 * signedPayload = `${t}.${rawBody}`; compara HMAC-SHA256 com v1.
 * Verifica também a tolerância de tempo (default 5 min) contra replay.
 */
export function verifyStripeSignature(rawBody: string, header: string, secret: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=').map((s) => s.trim())));
  const t = Number(parts['t']);
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false; // replay protection
  const expected = hmacSha256(`${t}.${rawBody}`, secret);
  return safeEqualHex(expected, v1);
}

/**
 * Mercado Pago: header `x-signature: ts=<ts>,v1=<sig>` + `x-request-id`.
 * manifest = `id:<dataId>;request-id:<requestId>;ts:<ts>;`
 */
export function verifyMercadoPagoSignature(xSignature: string, requestId: string, dataId: string, secret: string): boolean {
  if (!xSignature) return false;
  const parts = Object.fromEntries(xSignature.split(',').map((kv) => kv.split('=').map((s) => s.trim())));
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = hmacSha256(manifest, secret);
  return safeEqualHex(expected, v1);
}
