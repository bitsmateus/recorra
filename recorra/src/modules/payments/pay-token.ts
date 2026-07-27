import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token público da página de pagamento (`/pay/:token`). Assina o id da fatura com
 * HMAC(JWT_SECRET) para o link ir num botão de WhatsApp sem expor um id "cru" nem
 * permitir varrer faturas por tentativa. Formato: `<invoiceId>.<assinatura>`.
 *
 * Lê o segredo de `process.env` sob demanda (não importa o módulo de env, que
 * valida no carregamento e quebraria em contexto de teste). Em produção o boot já
 * garante JWT_SECRET; o fallback só evita throw em teste, onde isto não é chamado.
 */
function assinatura(invoiceId: string): string {
  return createHmac('sha256', process.env.JWT_SECRET || 'dev').update(invoiceId).digest('base64url');
}

export function assinarPagamento(invoiceId: string): string {
  return `${invoiceId}.${assinatura(invoiceId)}`;
}

/** Devolve o invoiceId se o token confere; senão null. Comparação time-safe. */
export function verificarPagamento(token: string): string | null {
  const i = (token || '').lastIndexOf('.');
  if (i <= 0) return null;
  const invoiceId = token.slice(0, i);
  const esperado = assinarPagamento(invoiceId);
  const a = Buffer.from(token);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? invoiceId : null;
}
