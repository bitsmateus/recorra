import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { CurrentUser, TenantId } from '@/common/auth/current-user.decorator';
import { AuthUser } from '@/common/auth/jwt.types';
import { InboxService } from './inbox.service';

@Controller('inbox')
@UseGuards(JwtAuthGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get('conversas')
  conversas(@TenantId() tenantId: string, @Query('status') status?: string) {
    return this.inbox.listConversations(tenantId, status);
  }

  @Get('conversas/:id/mensagens')
  mensagens(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.inbox.getMessages(tenantId, id);
  }

  @Post('conversas/:id/responder')
  responder(@TenantId() tenantId: string, @Param('id') id: string, @Body('texto') texto: string, @CurrentUser() user: AuthUser) {
    return this.inbox.sendReply(tenantId, id, texto, user.id);
  }

  @Post('conversas/:id/resolver')
  resolver(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.inbox.resolve(tenantId, id);
  }
}
