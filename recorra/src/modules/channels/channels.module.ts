import { Module } from '@nestjs/common';
import { ChannelFactory } from './channel.factory';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';

@Module({
  controllers: [TemplatesController, ConnectionsController],
  providers: [ChannelFactory, TemplatesService, ConnectionsService],
  exports: [ChannelFactory],
})
export class ChannelsModule {}
