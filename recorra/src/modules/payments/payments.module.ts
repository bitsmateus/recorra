import { Module } from '@nestjs/common';
import { PaymentProviderFactory } from './payment-provider.factory';
import { ChargesService } from './charges.service';
import { ReconciliationService } from './reconciliation.service';
import { WebhookController } from './webhook.controller';
import { ChargesController } from './charges.controller';

@Module({
  controllers: [WebhookController, ChargesController],
  providers: [PaymentProviderFactory, ChargesService, ReconciliationService],
  exports: [PaymentProviderFactory, ChargesService, ReconciliationService],
})
export class PaymentsModule {}
