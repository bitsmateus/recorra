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

  supportsImport(): boolean {
    return true;
  }

  private metodoDe(paymentMethodId?: string, paymentTypeId?: string): ChargeMethod {
    if (paymentMethodId === 'pix' || paymentTypeId === 'bank_transfer') return 'PIX';
    if (paymentMethodId === 'bolbradesco' || paymentTypeId === 'ticket') return 'BOLETO';
    if (paymentTypeId === 'credit_card' || paymentTypeId === 'debit_card') return 'CARTAO';
    return 'PIX';
  }

  /**
   * O Mercado Pago não expõe uma "conta de cliente" estável ligada a cada pagamento —
   * o pagador vem embutido no pagamento (nome/doc/e-mail). Por isso derivamos os clientes
   * dos próprios pagamentos, deduplicando por documento (CPF/CNPJ), e usamos o documento
   * como identificador externo. Assim o vínculo pagamento→cliente fecha na importação.
   */
  private docDoPagamento(p: any): string {
    return String(p?.payer?.identification?.number ?? '').replace(/\D/g, '');
  }

  private async buscarPagamentos(): Promise<any[]> {
    const out: any[] = [];
    let offset = 0;
    const limit = 100;
    for (let i = 0; i < 100; i++) {
      const { data } = await this.http.get('/v1/payments/search', {
        params: { sort: 'date_created', criteria: 'desc', limit, offset },
      });
      const results: any[] = data?.results ?? [];
      out.push(...results);
      const total = data?.paging?.total ?? out.length;
      offset += limit;
      if (results.length === 0 || offset >= total) break;
    }
    return out;
  }

  async listCustomers(): Promise<ImportedCustomer[]> {
    const pagamentos = await this.buscarPagamentos();
    const porDoc = new Map<string, ImportedCustomer>();
    for (const p of pagamentos) {
      const doc = this.docDoPagamento(p);
      if (!doc || porDoc.has(doc)) continue;
      const nome = [p?.payer?.first_name, p?.payer?.last_name].filter(Boolean).join(' ').trim();
      porDoc.set(doc, {
        externalId: doc,
        nome: nome || p?.payer?.email || doc,
        doc,
        email: p?.payer?.email ?? undefined,
        telefone: p?.payer?.phone?.number ? `${p.payer.phone.area_code ?? ''}${p.payer.phone.number}` : undefined,
      });
    }
    return [...porDoc.values()];
  }

  private mapPagamento(p: any): ImportedPayment {
    const tx = p?.point_of_interaction?.transaction_data;
    return {
      externalId: String(p.id),
      customerExternalId: this.docDoPagamento(p),
      valor: Number(p.transaction_amount),
      vencimento: new Date(p.date_of_expiration ?? p.date_created),
      status: this.normalizeStatus(p.status),
      metodo: this.metodoDe(p.payment_method_id, p.payment_type_id),
      descricao: p.description ?? undefined,
      pixCopiaCola: tx?.qr_code ?? undefined,
      linkPagamento: tx?.ticket_url ?? p?.transaction_details?.external_resource_url ?? undefined,
      pagoEm: p.date_approved ? new Date(p.date_approved) : undefined,
    };
  }

  async listPayments(): Promise<ImportedPayment[]> {
    const pagamentos = await this.buscarPagamentos();
    return pagamentos.filter((p) => this.docDoPagamento(p)).map((p) => this.mapPagamento(p));
  }

  async getChargeDetail(externalId: string): Promise<ImportedPayment | null> {
    try {
      const { data: p } = await this.http.get(`/v1/payments/${externalId}`);
      if (!p?.id) return null;
      return this.mapPagamento(p);
    } catch {
      return null;
    }
  }
}
