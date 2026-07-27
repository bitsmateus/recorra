import { Module } from '@nestjs/common';
import { PaymentProviderFactory } from './payment-provider.factory';
import { PaymentNotifyService } from './payment-notify.service';
import { ChargesService } from './charges.service';
import { ReconciliationService } from './reconciliation.service';
import { WebhookController } from './webhook.controller';
import { ChargesController } from './charges.controller';
import { PayController } from './pay.controller';
import { PayService } from './pay.service';
import { ConnectorsModule } from '@/modules/connectors/connectors.module';

@Module({
  imports: [ConnectorsModule],
  controllers: [WebhookController, ChargesController, PayController],
  providers: [PaymentProviderFactory, ChargesService, ReconciliationService, PaymentNotifyService, PayService],
  exports: [PaymentProviderFactory, ChargesService, ReconciliationService, PaymentNotifyService],
})
export class PaymentsModule {}
