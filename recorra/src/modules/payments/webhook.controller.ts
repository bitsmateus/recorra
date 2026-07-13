import { Body, Controller, Headers, HttpCode, Param, Post, Req, Logger } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PaymentProviderFactory } from './payment-provider.factory';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: PaymentProviderFactory,
  ) {}

  @Post(':provider/:accountId')
  @HttpCode(200)
  async receive(
    @Param('accountId') accountId: string,
    @Headers() headers: Record<string, string>,
    @Body() body: unknown,
    @Req() req: Request & { rawBody?: string },
  ) {
    const account = await this.prisma.paymentProviderAccount.findUnique({ where: { id: accountId } });
    if (!account) return { ok: true };

    const provider = await this.factory.forAccount(accountId);
    const parsed = provider.parseWebhook(headers, body, req.rawBody);

    if (!parsed.valid) {
      this.logger.warn(`Webhook com assinatura invalida para conta ${accountId}`);
      return { ok: false };
    }

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { idempotencyKey: parsed.idempotencyKey },
    });
    if (existing?.processadoEm) return { ok: true };

    await this.prisma.webhookEvent.upsert({
      where: { idempotencyKey: parsed.idempotencyKey },
      create: {
        tenantId: account.tenantId,
        provider: account.provider,
        tipo: parsed.eventType,
        payload: body as object,
        assinaturaOk: true,
        idempotencyKey: parsed.idempotencyKey,
      },
      update: {},
    });

    let status = parsed.status;
    let pagoEm = parsed.pagoEm;
    if (parsed.externalId && !status) {
      try {
        const consulta = await provider.getChargeStatus(parsed.externalId);
        status = consulta.status;
        pagoEm = consulta.pagoEm;
      } catch {
        // se falhar a consulta, encerra sem marcar
      }
    }

    if (parsed.externalId && status === 'PAGA') {
      const invoice = await this.prisma.invoice.findFirst({
        where: { tenantId: account.tenantId, provider: account.provider, externalId: parsed.externalId },
        include: { customer: true },
      });
      if (invoice) {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'PAGA', pagoEm: pagoEm ?? new Date() },
        });

        await this.prisma.messageDispatch.updateMany({
          where: { tenantId: account.tenantId, invoiceId: invoice.id, status: 'FILA' },
          data: { status: 'IGNORADO', erro: 'Pagamento confirmado - regua pausada' },
        });

        const primeiroNome = invoice.customer.nome.split(' ')[0];
        await this.prisma.messageDispatch.create({
          data: {
            tenantId: account.tenantId,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            canal: 'WHATSAPP_CLOUD',
            template: 'confirmacao_pagamento',
            conteudo: `Recebemos seu pagamento, ${primeiroNome}! Obrigado. Sua fatura esta quitada.`,
            status: 'FILA',
            agendadoPara: new Date(),
          },
        });
      }
    }

    await this.prisma.webhookEvent.update({
      where: { idempotencyKey: parsed.idempotencyKey },
      data: { processadoEm: new Date() },
    });

    return { ok: true };
  }
}
