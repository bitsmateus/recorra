import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PayService } from './pay.service';

/**
 * Página pública de pagamento — destino do botão do WhatsApp. Sem autenticação
 * (o token assinado é a credencial) e fora do prefixo /api (ver main.ts).
 */
@Controller('pay')
export class PayController {
  constructor(private readonly pay: PayService) {}

  @Get(':token')
  async page(@Param('token') token: string, @Res() res: Response) {
    const { status, body } = await this.pay.render(token);
    res.status(status).type('html').send(body);
  }
}
