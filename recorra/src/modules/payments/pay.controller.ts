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

  /**
   * O helmet() global aplica um CSP que bloqueia script inline — o que quebraria o
   * botão "copiar Pix". A página é autocontida (sem recurso externo), então damos um
   * CSP restrito porém com inline liberado só aqui.
   */
  private csp(res: Response) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  }

  @Get('pay/:token')
  async page(@Param('token') token: string, @Res() res: Response) {
    const { status, body } = await this.pay.render(token);
    this.csp(res);
    res.status(status).type('html').send(body);
  }

  @Get('boleto/:token')
  async boleto(@Param('token') token: string, @Res() res: Response) {
    const url = await this.pay.urlBoleto(token);
    if (url) return res.redirect(302, url);
    // Sem boleto: cai na página de pagamento (que ainda mostra o Pix).
    const { status, body } = await this.pay.render(token);
    this.csp(res);
    res.status(status).type('html').send(body);
  }
}
