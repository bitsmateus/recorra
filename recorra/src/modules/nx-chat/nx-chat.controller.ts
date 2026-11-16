import { Body, Controller, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { NxChatService } from './nx-chat.service';

/**
 * Webhook público do chat NX (mensagens dos atendimentos). Cada conta NX tem a
 * sua URL, com um token secreto gerado em Canais — o NX não assina o corpo, então
 * o segredo vai no caminho. Configure no NX (Integrações → webhook) apontando para:
 *   POST /webhooks/nx-chat/:accountId/:token
 */
// Sem limite por IP: todas as mensagens de todos os atendimentos chegam do mesmo
// servidor do NX (o limite global de 120/min derrubaria um chat movimentado). O
// acesso já é barrado pelo token secreto.
@SkipThrottle()
@Controller('webhooks/nx-chat')
export class NxChatController {
  constructor(private readonly nx: NxChatService) {}

  @Post(':accountId/:token')
  @HttpCode(200)
  async receber(@Param('accountId') accountId: string, @Param('token') token: string, @Body() body: unknown) {
    const r = await this.nx.receber(accountId, token, body);
    // Conta inexistente/inativa ou token errado: 404 genérico (não revela qual dos dois).
    if (!r) throw new NotFoundException();
    return r;
  }
}
