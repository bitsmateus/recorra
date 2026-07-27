import { Module } from '@nestjs/common';
import { PaymentProviderFactory } from './payment-provider.factory';
import { PaymentNotifyService } from './payment-notify.service';
import { ChargesService } from './charges.service';
import { ReconciliationService } from './reconciliation.service';
import { WebhookController } from './webhook.controller';
import { ChargesController } from './charges.controller';
import { ConnectorsModule } from '@/modules/connectors/connectors.module';

@Module({
  imports: [ConnectorsModule],
  controllers: [WebhookController, ChargesController],
  providers: [PaymentProviderFactory, ChargesService, ReconciliationService, PaymentNotifyService],
  exports: [PaymentProviderFactory, ChargesService, ReconciliationService, PaymentNotifyService],
})
export class PaymentsModule {}
