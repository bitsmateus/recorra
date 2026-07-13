import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { AiService } from './ai.service';

@Controller('ia')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('regua')
  regua(@Body() brief: Record<string, unknown>) {
    return this.ai.gerarRegua(brief as never);
  }

  @Post('mensagem')
  mensagem(@Body('texto') texto: string, @Body('instrucao') instrucao: string) {
    return this.ai.melhorarMensagem(texto ?? '', instrucao ?? '');
  }
}
