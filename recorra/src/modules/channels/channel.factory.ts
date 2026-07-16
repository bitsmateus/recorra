import { BadRequestException, Injectable } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { MessageChannel, ChannelCredentials } from './message-channel.interface';
import { EmailMarca } from './email-layout';
import { verifyInboundSignature } from '@/modules/inbox/inbound-signature';
import { ChannelAccount } from '@prisma/client';
import { WhatsAppCloudChannel } from './providers/whatsapp-cloud.channel';
import { WhatsAppEvolutionChannel } from './providers/whatsapp-evolution.channel';
import { WhatsAppUazapiChannel } from './providers/whatsapp-uazapi.channel';
import { EmailChannel } from './providers/email.channel';
import { SmsChannel } from './providers/sms.channel';
import { HttpGenericChannel } from './providers/http-generic.channel';
import { NxSystemsChannel } from './providers/nx-systems.channel';

/**
 * Resolve o canal a partir da conta configurada pelo tenant.
 * WhatsApp: Cloud (oficial) | Evolution | uazapi — todos plugáveis.
 */
@Injectable()
export class ChannelFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Retorna a primeira conta ativa do tenant para o canal pedido. */
  async forTenantChannel(tenantId: string, canal: ChannelType, accountId?: string | null): Promise<MessageChannel> {
    const account = accountId
      ? await this.prisma.channelAccount.findFirst({ where: { id: accountId, tenantId, ativo: true } })
      : await this.prisma.channelAccount.findFirst({ where: { tenantId, canal, ativo: true } });
    if (!account) throw new BadRequestException(`Nenhuma conta ativa para o canal ${canal}`);
    const creds = this.crypto.decryptJson<ChannelCredentials>(account.credentials);
    // A marca do e-mail é do tenant, não da conta: injeta na hora do envio.
    if (account.canal === 'EMAIL') creds.emailMarca = await this.marcaEmail(tenantId);
    return this.build(account.canal, creds);
  }

  /** Marca do e-mail (Tenant.config.emailMarca); cai no nome do tenant se não configurada. */
  async marcaEmail(tenantId: string): Promise<EmailMarca> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { nome: true, config: true } });
    const cfg = (tenant?.config ?? {}) as { emailMarca?: EmailMarca };
    const marca = cfg.emailMarca ?? {};
    return { ...marca, empresa: marca.empresa?.trim() || tenant?.nome || undefined };
  }

  /**
   * Valida um webhook de ENTRADA (inbound) e, se autêntico, retorna a conta.
   * Retorna null se a conta não existe/está inativa ou a assinatura é inválida.
   */
  async verifyInbound(accountId: string, headers: Record<string, string>, rawBody: string): Promise<ChannelAccount | null> {
    const account = await this.prisma.channelAccount.findUnique({ where: { id: accountId } });
    if (!account || !account.ativo) return null;
    const creds = this.crypto.decryptJson<ChannelCredentials>(account.credentials);
    return verifyInboundSignature(account.canal, creds, headers, rawBody) ? account : null;
  }

  build(canal: ChannelType, creds: ChannelCredentials): MessageChannel {
    switch (canal) {
      case 'WHATSAPP_CLOUD':
        return new WhatsAppCloudChannel(creds);
      case 'WHATSAPP_EVOLUTION':
        return new WhatsAppEvolutionChannel(creds);
      case 'WHATSAPP_UAZAPI':
        return new WhatsAppUazapiChannel(creds);
      case 'EMAIL':
        return new EmailChannel(creds);
      case 'SMS':
        return new SmsChannel(creds);
      case 'HTTP_GENERIC':
        return new HttpGenericChannel(creds);
      case 'NX_SYSTEMS':
        return new NxSystemsChannel(creds);
      default:
        throw new BadRequestException(`Canal ${canal} ainda não implementado`);
    }
  }
}
