import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/common/prisma/prisma.module';
import { DunningModule } from '@/modules/dunning/dunning.module';
import { BillingModule } from '@/modules/billing/billing.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { BillingSaasModule } from '@/modules/platform/billing-saas.module';
import { CampaignsModule } from '@/modules/campaigns/campaigns.module';
import { SchedulerService } from './scheduler.service';
import { DispatchQueue } from '@/queue/dispatch-queue';
import { DispatchWorker } from '@/queue/dispatch.worker';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    DunningModule,
    BillingModule,
    PaymentsModule,
    BillingSaasModule,
    CampaignsModule,
  ],
  providers: [SchedulerService, DispatchQueue, DispatchWorker],
})
export class WorkerModule {}
