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
import { safeEqual } from '@/common/auth/tokens';

export class AsaasProvider implements PaymentProvider {
  readonly type = 'ASAAS';
  private readonly http: AxiosInstance;
  private readonly webhookToken?: string;

  constructor(creds: ProviderCredentials) {
    const baseURL =
      creds.ambiente === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://sandbox.asaas.com/api/v3';
    this.http = axios.create({
      baseURL,
      headers: { access_token: creds.apiKey, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    this.webhookToken = creds.webhookToken;
  }

  private billingType(metodo: ChargeMethod): string {
    switch (metodo) {
      case 'BOLETO':
        return 'BOLETO';
      case 'CARTAO':
        return 'CREDIT_CARD';
      case 'PIX':
      case 'PIX_AUTOMATICO':
      default:
        return 'PIX';
    }
  }

  async testConnection(): Promise<boolean> {
    // GET leve e autenticado: token inválido devolve 401.
    const { status } = await this.http.get('/customers', { params: { limit: 1 } });
    return status >= 200 && status < 300;
  }

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const customerId = await this.ensureCustomer(input);

    const split = input.splits?.map((s) => ({
      walletId: s.destino,
      ...(s.percentual !== undefined ? { percentualValue: s.percentual } : {}),
      ...(s.valorFixo !== undefined ? { fixedValue: s.valorFixo } : {}),
    }));
    const { data: charge } = await this.http.post('/payments', {
      customer: customerId,
      billingType: this.billingType(input.metodo),
      value: input.valor,
      dueDate: input.vencimento.toISOString().slice(0, 10),
      description: input.descricao,
      externalReference: input.externalRef,
      ...(split?.length ? { split } : {}),
    });

    const result: CreateChargeResult = {
      externalId: charge.id,
      status: this.normalizeStatus(charge.status),
      boletoLinha: charge.identificationField,
      boletoUrl: charge.bankSlipUrl,
      linkPagamento: charge.invoiceUrl,
    };

    if (this.billingType(input.metodo) === 'PIX') {
      try {
        const { data: pix } = await this.http.get(`/payments/${charge.id}/pixQrCode`);
        result.pixCopiaCola = pix.payload;
      } catch {
        // Pix pode nao estar habilitado; segue sem copia-e-cola.
      }
    }
    return result;
  }

  private async ensureCustomer(input: CreateChargeInput): Promise<string> {
    const { data: search } = await this.http.get('/customers', {
      params: { cpfCnpj: input.customer.doc },
    });
    if (search?.data?.length) return search.data[0].id;

    const { data: created } = await this.http.post('/customers', {
      name: input.customer.nome,
      cpfCnpj: input.customer.doc,
      email: input.customer.email,
      mobilePhone: input.customer.telefone,
    });
    return created.id;
  }

  async getPixCopiaCola(externalId: string): Promise<string | null> {
    try {
      const { data } = await this.http.get(`/payments/${externalId}/pixQrCode`);
      return data?.payload ?? null;
    } catch {
      return null;
    }
  }

  async getChargeStatus(externalId: string): Promise<ChargeStatusResult> {
    const { data } = await this.http.get(`/payments/${externalId}`);
    return {
      externalId,
      status: this.normalizeStatus(data.status),
      pagoEm: data.paymentDate ? new Date(data.paymentDate) : undefined,
    };
  }

  async cancelCharge(externalId: string): Promise<void> {
    await this.http.delete(`/payments/${externalId}`);
  }

  parseWebhook(headers: Record<string, string>, body: unknown): WebhookParseResult {
    const token = headers['asaas-access-token'] ?? headers['Asaas-Access-Token'] ?? '';
    // Fail-closed: sem webhookToken configurado, o webhook não é confiável.
    // Comparação em tempo constante (evita timing attack).
    const valid = !!this.webhookToken && safeEqual(token, this.webhookToken);
    const evt = body as { event?: string; payment?: { id?: string; status?: string; paymentDate?: string } };

    return {
      valid,
      eventType: evt.event ?? 'UNKNOWN',
      externalId: evt.payment?.id,
      // Não confiamos no status do corpo — o controller reconfirma via API.
      status: undefined,
      pagoEm: evt.payment?.paymentDate ? new Date(evt.payment.paymentDate) : undefined,
      idempotencyKey: `asaas:${evt.event}:${evt.payment?.id}:${evt.payment?.status}`,
    };
  }


  supportsImport(): boolean {
    return true;
  }

  private methodFromBillingType(bt?: string): ChargeMethod {
    switch (bt) {
      case "BOLETO":
        return "BOLETO";
      case "CREDIT_CARD":
        return "CARTAO";
      case "PIX":
        return "PIX";
      default:
        return "PIX";
    }
  }

  async listCustomers(): Promise<ImportedCustomer[]> {
    const out: ImportedCustomer[] = [];
    let offset = 0;
    for (let i = 0; i < 100; i++) {
      const { data } = await this.http.get("/customers", { params: { limit: 100, offset } });
      for (const c of data?.data ?? []) {
        if (!c.cpfCnpj) continue;
        out.push({
          externalId: c.id,
          nome: c.name,
          doc: String(c.cpfCnpj),
          email: c.email ?? undefined,
          telefone: c.mobilePhone ?? c.phone ?? undefined,
          cidade: c.cityName ? String(c.cityName) : undefined,
          uf: c.state ? String(c.state) : undefined,
        });
      }
      if (!data?.hasMore) break;
      offset += 100;
    }
    return out;
  }

  async getChargeDetail(externalId: string): Promise<ImportedPayment | null> {
    try {
      const { data: p } = await this.http.get(`/payments/${externalId}`);
      if (!p?.id) return null;
      return {
        externalId: p.id,
        customerExternalId: p.customer,
        valor: Number(p.value),
        vencimento: new Date(p.dueDate),
        status: this.normalizeStatus(p.status),
        metodo: this.methodFromBillingType(p.billingType),
        descricao: p.description ?? undefined,
        linkPagamento: p.invoiceUrl ?? undefined,
        boletoUrl: p.bankSlipUrl ?? undefined,
        pagoEm: p.paymentDate ? new Date(p.paymentDate) : undefined,
      };
    } catch {
      return null;
    }
  }

  async listPayments(): Promise<ImportedPayment[]> {
    const out: ImportedPayment[] = [];
    let offset = 0;
    for (let i = 0; i < 200; i++) {
      const { data } = await this.http.get("/payments", { params: { limit: 100, offset } });
      for (const p of data?.data ?? []) {
        out.push({
          externalId: p.id,
          customerExternalId: p.customer,
          valor: Number(p.value),
          vencimento: new Date(p.dueDate),
          status: this.normalizeStatus(p.status),
          metodo: this.methodFromBillingType(p.billingType),
          descricao: p.description ?? undefined,
          linkPagamento: p.invoiceUrl ?? undefined,
          boletoUrl: p.bankSlipUrl ?? undefined,
          pagoEm: p.paymentDate ? new Date(p.paymentDate) : undefined,
        });
      }
      if (!data?.hasMore) break;
      offset += 100;
    }
    return out;
  }

  private normalizeStatus(asaasStatus: string): string {
    const map: Record<string, string> = {
      PENDING: 'PENDENTE',
      RECEIVED: 'PAGA',
      CONFIRMED: 'PAGA',
      RECEIVED_IN_CASH: 'PAGA',
      OVERDUE: 'VENCIDA',
      REFUNDED: 'ESTORNADA',
      DELETED: 'CANCELADA',
    };
    return map[asaasStatus] ?? 'PENDENTE';
  }
}
