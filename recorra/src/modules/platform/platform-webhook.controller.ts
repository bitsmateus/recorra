import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { PlatformAsaasService } from './platform-asaas.service';

/**
 * Webhook do Asaas da PLATAFORMA (SaaS cobrando os tenants). Público (sem
 * PlatformGuard) — a autenticidade vem do token do Asaas e, principalmente, da
 * reconfirmação do status na API. Configure esta URL no painel do Asaas:
 *   POST {API}/webhooks/plataforma/asaas
 */
@Controller('webhooks/plataforma')
export class PlatformWebhookController {
  constructor(private readonly asaas: PlatformAsaasService) {}

  @Post('asaas')
  @HttpCode(200)
  asaas(@Headers() headers: Record<string, string>, @Body() body: unknown) {
    return this.asaas.handleWebhook(headers, body);
  }
}
