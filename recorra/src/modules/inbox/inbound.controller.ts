import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { InboxService } from './inbox.service';

/**
 * Webhook de mensagens RECEBIDAS dos canais (respostas do cliente).
 * Rota pública. Configure no provedor apontando para:
 *   POST /webhooks/inbound/:accountId
 * Faz parsing best-effort de Evolution, Cloud API (Meta) e uazapi.
 */
@Controller('webhooks/inbound')
export class InboundController {
  constructor(private readonly inbox: InboxService) {}

  @Post(':accountId')
  @HttpCode(200)
  async receive(
    @Param('accountId') accountId: string,
    @Headers() headers: Record<string, string>,
    @Body() body: any,
    @Req() req: Request & { rawBody?: string },
  ) {
    const parsed = this.parse(body);
    if (!parsed) return { ok: true };
    return this.inbox.handleInbound(accountId, parsed.from, parsed.text, headers, req.rawBody ?? '');
  }

  /** Extrai { from, text } dos diferentes formatos de payload. */
  private parse(body: any): { from: string; text: string } | null {
    // WhatsApp Cloud API (Meta)
    const cloud = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (cloud?.from) {
      return { from: cloud.from, text: cloud.text?.body ?? cloud.button?.text ?? '' };
    }
    // Evolution API
    const evo = body?.data;
    if (evo?.key?.remoteJid) {
      const from = String(evo.key.remoteJid).replace(/@.*/, '');
      const text = evo.message?.conversation ?? evo.message?.extendedTextMessage?.text ?? '';
      if (from) return { from, text };
    }
    // uazapi / genérico
    const from = body?.from ?? body?.sender ?? body?.phone ?? body?.number;
    const text = body?.text ?? body?.message ?? body?.body;
    if (from && typeof text === 'string') return { from: String(from), text };
    return null;
  }
}
