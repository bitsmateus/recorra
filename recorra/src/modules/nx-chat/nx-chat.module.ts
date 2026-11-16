import { Module } from '@nestjs/common';
import { NxChatController } from './nx-chat.controller';
import { NxChatService } from './nx-chat.service';

@Module({
  controllers: [NxChatController],
  providers: [NxChatService],
})
export class NxChatModule {}
