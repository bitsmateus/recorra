import { Module } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.controller';
import { InboundController } from './inbound.controller';
import { ChannelsModule } from '@/modules/channels/channels.module';

@Module({
  imports: [ChannelsModule],
  controllers: [InboxController, InboundController],
  providers: [InboxService],
})
export class InboxModule {}
