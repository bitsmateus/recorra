import { Module } from '@nestjs/common';
import { PrismaModule } from '@/common/prisma/prisma.module';
import { DunningModule } from '@/modules/dunning/dunning.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { ConnectorsModule } from '@/modules/connectors/connectors.module';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { DispatchQueue } from '@/queue/dispatch-queue';

@Module({
  imports: [PrismaModule, DunningModule, PaymentsModule, ConnectorsModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, DispatchQueue],
  exports: [CampaignsService],
})
export class CampaignsModule {}
