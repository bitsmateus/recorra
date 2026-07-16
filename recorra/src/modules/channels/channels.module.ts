import { Module } from '@nestjs/common';
import { ChannelFactory } from './channel.factory';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTemplatesController } from './email-templates.controller';

@Module({
  controllers: [TemplatesController, ConnectionsController, EmailTemplatesController],
  providers: [ChannelFactory, TemplatesService, ConnectionsService, EmailTemplatesService],
  exports: [ChannelFactory],
})
export class ChannelsModule {}
