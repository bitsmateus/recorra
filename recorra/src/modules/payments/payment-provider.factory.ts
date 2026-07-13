import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentProviderType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { PaymentProvider, ProviderCredentials } from './payment-provider.interface';
import { AsaasProvider } from './providers/asaas.provider';
import { MercadoPagoProvider } from './providers/mercadopago.provider';
import { EfiProvider } from './providers/efi.provider';
import { StripeProvider } from './providers/stripe.provider';

@Injectable()
export class PaymentProviderFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async forAccount(accountId: string): Promise<PaymentProvider> {
    const account = await this.prisma.paymentProviderAccount.findUnique({ where: { id: accountId } });
    if (!account || !account.ativo) throw new BadRequestException('Conta de gateway invalida');

    const creds = this.crypto.decryptJson<ProviderCredentials>(account.credentials);
    creds.ambiente = account.ambiente as 'sandbox' | 'production';
    return this.build(account.provider, creds);
  }

  build(provider: PaymentProviderType, creds: ProviderCredentials): PaymentProvider {
    switch (provider) {
      case 'ASAAS':
        return new AsaasProvider(creds);
      case 'MERCADO_PAGO':
        return new MercadoPagoProvider(creds);
      case 'EFI':
        return new EfiProvider(creds);
      case 'STRIPE':
        return new StripeProvider(creds);
      default:
        throw new BadRequestException(`Gateway ${provider} ainda nao implementado`);
    }
  }
}
