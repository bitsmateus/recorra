import { createHmac, timingSafeEqual } from 'node:crypto';
import { ChannelType } from '@prisma/client';
import { ChannelCredentials } from '@/modules/channels/message-channel.interface';

/**
 * Verificação de autenticidade de webhooks de ENTRADA (respostas do cliente).
 * Pura e testável. Sem isso, qualquer um POSTa uma mensagem forjada de qualquer
 * telefone e aciona ações no sistema (contestar fatura, opt-out, queima de custo).
 *
 * Política fail-closed: sem segredo verificável, o inbound é rejeitado.
 */

/** Comparação em tempo constante (evita timing attack). */
export function safeStrEq(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/** Lê um header de forma case-insensitive. */
function header(headers: Record<string, string>, name: string): string {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers ?? {})) {
    if (k.toLowerCase() === lower) return String(headers[k] ?? '');
  }
  return '';
}

/**
 * Retorna true somente se o webhook de entrada for comprovadamente do provedor
 * configurado para aquela conta de canal.
 */
export function verifyInboundSignature(
  canal: ChannelType,
  creds: ChannelCredentials,
  headers: Record<string, string>,
  rawBody: string,
): boolean {
  switch (canal) {
    case 'WHATSAPP_EVOLUTION': {
      // A Evolution envia o `apikey` da instância em todo webhook.
      return safeStrEq(header(headers, 'apikey'), creds.apiKey ?? '');
    }
    case 'WHATSAPP_CLOUD': {
      // Meta assina o corpo com o App Secret: X-Hub-Signature-256: sha256=<hmac>.
      const secret = creds.webhookSecret;
      if (!secret) return false;
      const provided = header(headers, 'x-hub-signature-256');
      const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody ?? '').digest('hex');
      return safeStrEq(provided, expected);
    }
    case 'WHATSAPP_UAZAPI': {
      // uazapi/genérico: token compartilhado no header (config no provedor).
      const secret = creds.webhookSecret ?? creds.token ?? creds.apiKey ?? '';
      const provided = header(headers, 'token') || header(headers, 'apikey') || header(headers, 'x-webhook-token');
      return !!secret && safeStrEq(provided, secret);
    }
    default: {
      const secret = creds.webhookSecret ?? '';
      const provided = header(headers, 'x-webhook-token') || header(headers, 'token');
      return !!secret && safeStrEq(provided, secret);
    }
  }
}
