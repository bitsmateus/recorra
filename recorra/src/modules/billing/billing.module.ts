import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { AgreementsService } from './agreements.service';
import { BillingController } from './billing.controller';
import { PaymentsModule } from '@/modules/payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [BillingController],
  providers: [SubscriptionsService, AgreementsService],
  exports: [SubscriptionsService, AgreementsService],
})
export class BillingModule {}
