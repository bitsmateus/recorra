import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PayService } from './pay.service';

/**
 * Páginas públicas de pagamento — destino dos botões do WhatsApp. Sem autenticação
 * (o token assinado é a credencial) e fora do prefixo /api (ver main.ts).
 *  - /pay/:token    → página com Pix copia-e-cola (copiar) + boleto.
 *  - /boleto/:token → redireciona direto para o boleto (botão só do boleto).
 */
@Controller()
export class PayController {
  constructor(private readonly pay: PayService) {}

  @Get('pay/:token')
  async page(@Param('token') token: string, @Res() res: Response) {
    const { status, body } = await this.pay.render(token);
    res.status(status).type('html').send(body);
  }

  @Get('boleto/:token')
  async boleto(@Param('token') token: string, @Res() res: Response) {
    const url = await this.pay.urlBoleto(token);
    if (url) return res.redirect(302, url);
    // Sem boleto: cai na página de pagamento (que ainda mostra o Pix).
    const { status, body } = await this.pay.render(token);
    res.status(status).type('html').send(body);
  }
}
