import axios, { AxiosInstance } from 'axios';
import { ChargeMethod } from '@prisma/client';
import {
  PaymentProvider,
  CreateChargeInput,
  CreateChargeResult,
  ChargeStatusResult,
  WebhookParseResult,
  ProviderCredentials,
  ImportedCustomer,
  ImportedPayment,
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

  async testConnection(): Promise<boolean> {
    // /v1/balance valida a secret key.
    const { status } = await this.http.get('/v1/balance');
    return status >= 200 && status < 300;
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

  supportsImport(): boolean {
    return true;
  }

  // O Stripe não tem campo nativo de CPF/CNPJ; convém guardá-lo no metadata do customer.
  private docDoCustomer(cust: any): string {
    const m = cust?.metadata ?? {};
    const raw = m.cpf ?? m.cnpj ?? m.doc ?? m.documento ?? m.document ?? m.tax_id ?? '';
    return String(raw).replace(/\D/g, '');
  }

  private metodoDe(types?: string[]): ChargeMethod {
    const t = types ?? [];
    if (t.includes('pix')) return 'PIX';
    if (t.includes('boleto')) return 'BOLETO';
    if (t.includes('card')) return 'CARTAO';
    return 'PIX';
  }

  private vencimentoDe(pi: any): Date {
    const na = pi?.next_action;
    const exp = na?.pix_display_qr_code?.expires_at ?? na?.boleto_display_details?.expires_at;
    if (exp) return new Date(Number(exp) * 1000);
    return new Date(Number(pi?.created ?? 0) * 1000);
  }

  private mapPI(pi: any): ImportedPayment {
    const na = pi?.next_action;
    return {
      externalId: pi.id,
      customerExternalId: pi.customer ? String(pi.customer) : '',
      valor: Number(pi.amount ?? 0) / 100, // Stripe usa centavos
      vencimento: this.vencimentoDe(pi),
      status: this.normalizeStatus(pi.status),
      metodo: this.metodoDe(pi.payment_method_types),
      descricao: pi.description ?? undefined,
      pixCopiaCola: na?.pix_display_qr_code?.data ?? undefined,
      boletoUrl: na?.boleto_display_details?.hosted_voucher_url ?? undefined,
      linkPagamento: na?.hosted_voucher_url ?? undefined,
      pagoEm: pi.status === 'succeeded' ? new Date(Number(pi.created ?? 0) * 1000) : undefined,
    };
  }

  async listCustomers(): Promise<ImportedCustomer[]> {
    const out: ImportedCustomer[] = [];
    let startingAfter: string | undefined;
    for (let i = 0; i < 100; i++) {
      const { data } = await this.http.get('/v1/customers', {
        params: { limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) },
      });
      const rows: any[] = data?.data ?? [];
      for (const cu of rows) {
        const doc = this.docDoCustomer(cu);
        if (!doc) continue; // sem CPF/CNPJ não dá para deduplicar/criar o cliente
        out.push({ externalId: cu.id, nome: cu.name || cu.email || doc, doc, email: cu.email ?? undefined, telefone: cu.phone ?? undefined });
      }
      if (!data?.has_more || rows.length === 0) break;
      startingAfter = rows[rows.length - 1].id;
    }
    return out;
  }

  async listPayments(): Promise<ImportedPayment[]> {
    const out: ImportedPayment[] = [];
    let startingAfter: string | undefined;
    for (let i = 0; i < 200; i++) {
      const { data } = await this.http.get('/v1/payment_intents', {
        params: { limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) },
      });
      const rows: any[] = data?.data ?? [];
      for (const pi of rows) if (pi.customer) out.push(this.mapPI(pi));
      if (!data?.has_more || rows.length === 0) break;
      startingAfter = rows[rows.length - 1].id;
    }
    return out;
  }

  async getChargeDetail(externalId: string): Promise<ImportedPayment | null> {
    try {
      const { data: pi } = await this.http.get(`/v1/payment_intents/${externalId}`);
      if (!pi?.id) return null;
      return this.mapPI(pi);
    } catch {
      return null;
    }
  }
}
