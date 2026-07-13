import { BadRequestException, Injectable } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { MessageChannel, ChannelCredentials } from './message-channel.interface';
import { WhatsAppCloudChannel } from './providers/whatsapp-cloud.channel';
import { WhatsAppEvolutionChannel } from './providers/whatsapp-evolution.channel';
import { WhatsAppUazapiChannel } from './providers/whatsapp-uazapi.channel';
import { EmailChannel } from './providers/email.channel';
import { SmsChannel } from './providers/sms.channel';

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
    return this.build(account.canal, creds);
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
      default:
        throw new BadRequestException(`Canal ${canal} ainda não implementado`);
    }
  }
}
