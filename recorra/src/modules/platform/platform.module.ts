import { Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { PlatformGuard } from './platform.guard';
import { PlatformAsaasService } from './platform-asaas.service';
import { PlatformWebhookController } from './platform-webhook.controller';
import { AccountController } from './account.controller';
import { AdminTutorialsController } from './admin-tutorials.controller';
import { BillingSaasModule } from './billing-saas.module';
import { TutorialsModule } from '@/modules/tutorials/tutorials.module';
import { IngestModule } from '@/modules/ingest/ingest.module';

@Module({
  imports: [BillingSaasModule, TutorialsModule, IngestModule],
  controllers: [PlatformController, PlatformWebhookController, AccountController, AdminTutorialsController],
  providers: [PlatformService, PlatformGuard, PlatformAsaasService],
  exports: [PlatformService],
})
export class PlatformModule {}
