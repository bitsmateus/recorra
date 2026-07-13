import { Module } from '@nestjs/common';
import { DunningService } from './dunning.service';
import { DispatchService } from './dispatch.service';
import { RulesService } from './rules.service';
import { RulesController } from './rules.controller';
import { ChannelsModule } from '@/modules/channels/channels.module';
import { RiskModule } from '@/modules/risk/risk.module';

@Module({
  imports: [ChannelsModule, RiskModule],
  controllers: [RulesController],
  providers: [DunningService, DispatchService, RulesService],
  exports: [DunningService, DispatchService, RulesService],
})
export class DunningModule {}
