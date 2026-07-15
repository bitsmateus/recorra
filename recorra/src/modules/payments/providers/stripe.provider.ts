import axios, { AxiosInstance } from 'axios';
import {
  PaymentProvider,
  CreateChargeInput,
  CreateChargeResult,
  ChargeStatusResult,
  WebhookParseResult,
  ProviderCredentials,
} from '../payment-provider.interface';
import { verifyStripeSignature } from '../webhook-signature';

export class StripeProvider implements PaymentProvider {
  readonly type = 'STRIPE';
  private readonly http: AxiosInstance;
  private readonly webhookSecret?: string;

  constructor(creds: ProviderCredentials) {
    this.http = axios.create({
      baseURL: 'https://api.stripe.com',
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });
    this.webhookSecret = creds.webhookToken;
  }

  private form(obj: Record<string, string | number>): string {
    return Object.entries(obj)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
  }

  private method(metodo: string): string {
    if (metodo === 'BOLETO') return 'boleto';
    if (metodo === 'CARTAO') return 'card';
    return 'pix';
  }

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const { data } = await this.http.post(
      '/v1/payment_intents',
      this.form({
        amount: Math.round(input.valor * 100),
        currency: 'brl',
        'payment_method_types[]': this.method(input.metodo),
        description: input.descricao ?? 'Cobranca',
        'metadata[externalRef]': input.externalRef ?? '',
      }),
    );

    const next = data.next_action;
    return {
      externalId: data.id,
      status: this.normalizeStatus(data.status),
      pixCopiaCola: next?.pix_display_qr_code?.data,
      boletoUrl: next?.boleto_display_details?.hosted_voucher_url,
      linkPagamento: next?.hosted_voucher_url,
    };
  }

  async getChargeStatus(externalId: string): Promise<ChargeStatusResult> {
    const { data } = await this.http.get(`/v1/payment_intents/${externalId}`);
    return {
      externalId,
      status: this.normalizeStatus(data.status),
      pagoEm: data.status === 'succeeded' ? new Date() : undefined,
    };
  }

  async cancelCharge(externalId: string): Promise<void> {
    await this.http.post(`/v1/payment_intents/${externalId}/cancel`, '');
  }

  parseWebhook(headers: Record<string, string>, body: unknown, rawBody?: string): WebhookParseResult {
    const evt = body as { type?: string; data?: { object?: { id?: string; status?: string } } };
    const obj = evt.data?.object;
    const sig = headers['stripe-signature'] ?? headers['Stripe-Signature'] ?? '';
    // Fail-closed: sem webhookSecret configurado, o webhook não é confiável.
    const valid = !!this.webhookSecret && verifyStripeSignature(rawBody ?? '', sig, this.webhookSecret);
    return {
      valid,
      eventType: evt.type ?? 'payment_intent',
      externalId: obj?.id,
      // Não confiamos no status do corpo — o controller reconfirma via API.
      status: undefined,
      idempotencyKey: `stripe:${evt.type}:${obj?.id}:${obj?.status}`,
    };
  }

  private normalizeStatus(s: string): string {
    const map: Record<string, string> = {
      requires_payment_method: 'PENDENTE',
      requires_action: 'PENDENTE',
      processing: 'PENDENTE',
      succeeded: 'PAGA',
      canceled: 'CANCELADA',
    };
    return map[s] ?? 'PENDENTE';
  }
}
