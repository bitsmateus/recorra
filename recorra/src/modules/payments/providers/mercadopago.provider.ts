import axios, { AxiosInstance } from 'axios';
import { ChargeMethod } from '@prisma/client';
import {
  PaymentProvider,
  CreateChargeInput,
  CreateChargeResult,
  ChargeStatusResult,
  WebhookParseResult,
  ProviderCredentials,
} from '../payment-provider.interface';
import { verifyMercadoPagoSignature } from '../webhook-signature';

export class MercadoPagoProvider implements PaymentProvider {
  readonly type = 'MERCADO_PAGO';
  private readonly http: AxiosInstance;
  private readonly webhookSecret?: string;

  constructor(creds: ProviderCredentials) {
    this.http = axios.create({
      baseURL: 'https://api.mercadopago.com',
      headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    this.webhookSecret = creds.webhookToken;
  }

  async testConnection(): Promise<boolean> {
    // /users/me valida o access token.
    const { status } = await this.http.get('/users/me');
    return status >= 200 && status < 300;
  }

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const [firstName, ...rest] = input.customer.nome.split(' ');
    const body = {
      transaction_amount: input.valor,
      description: input.descricao ?? 'Cobranca',
      payment_method_id: this.methodId(input.metodo),
      date_of_expiration: this.expiration(input.vencimento),
      external_reference: input.externalRef,
      payer: {
        email: input.customer.email ?? `${input.customer.doc}@sememail.com`,
        first_name: firstName,
        last_name: rest.join(' ') || firstName,
        identification: { type: input.customer.doc.length > 11 ? 'CNPJ' : 'CPF', number: input.customer.doc },
      },
    };

    const { data } = await this.http.post('/v1/payments', body, {
      headers: { 'X-Idempotency-Key': input.externalRef ?? `${Date.now()}` },
    });

    const tx = data.point_of_interaction?.transaction_data;
    return {
      externalId: String(data.id),
      status: this.normalizeStatus(data.status),
      pixCopiaCola: tx?.qr_code,
      linkPagamento: tx?.ticket_url ?? data.transaction_details?.external_resource_url,
    };
  }

  private methodId(metodo: ChargeMethod): string {
    if (metodo === 'BOLETO') return 'bolbradesco';
    return 'pix';
  }

  private expiration(venc: Date): string {
    const d = new Date(venc);
    d.setHours(23, 59, 59);
    return d.toISOString().replace('Z', '-03:00');
  }

  async getChargeStatus(externalId: string): Promise<ChargeStatusResult> {
    const { data } = await this.http.get(`/v1/payments/${externalId}`);
    return {
      externalId,
      status: this.normalizeStatus(data.status),
      pagoEm: data.date_approved ? new Date(data.date_approved) : undefined,
    };
  }

  async cancelCharge(externalId: string): Promise<void> {
    await this.http.put(`/v1/payments/${externalId}`, { status: 'cancelled' });
  }

  parseWebhook(headers: Record<string, string>, body: unknown): WebhookParseResult {
    const evt = body as { type?: string; action?: string; data?: { id?: string } };
    const paymentId = evt.data?.id ? String(evt.data.id) : undefined;
    const xSig = headers['x-signature'] ?? '';
    const reqId = headers['x-request-id'] ?? '';
    // Fail-closed: sem webhookSecret configurado, o webhook não é confiável.
    const valid = !!this.webhookSecret && verifyMercadoPagoSignature(xSig, reqId, paymentId ?? '', this.webhookSecret);
    return {
      valid,
      eventType: evt.type ?? evt.action ?? 'payment',
      externalId: paymentId,
      status: undefined,
      idempotencyKey: `mp:${evt.type ?? evt.action}:${paymentId}`,
    };
  }

  private normalizeStatus(mpStatus: string): string {
    const map: Record<string, string> = {
      pending: 'PENDENTE',
      in_process: 'PENDENTE',
      approved: 'PAGA',
      authorized: 'PAGA',
      rejected: 'CANCELADA',
      cancelled: 'CANCELADA',
      refunded: 'ESTORNADA',
    };
    return map[mpStatus] ?? 'PENDENTE';
  }
}
