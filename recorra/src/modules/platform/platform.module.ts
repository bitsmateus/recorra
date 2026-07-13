import { Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { PlatformGuard } from './platform.guard';
import { AccountController } from './account.controller';
import { AdminTutorialsController } from './admin-tutorials.controller';
import { BillingSaasModule } from './billing-saas.module';
import { TutorialsModule } from '@/modules/tutorials/tutorials.module';

@Module({
  imports: [BillingSaasModule, TutorialsModule],
  controllers: [PlatformController, AccountController, AdminTutorialsController],
  providers: [PlatformService, PlatformGuard],
})
export class PlatformModule {}
