import axios, { AxiosInstance } from 'axios';
import {
  SourceConnector,
  SourceCustomer,
  SourceInvoice,
  SourceCredentials,
} from '../source-connector.interface';
import { onlyDigits, normalizePhoneBR } from '@/common/util/normalize';

/**
 * Conector Voalle (ERP Grupo Voalle).
 * API REST com OAuth2 (client_credentials). `extra` deve conter
 * client_id, client_secret e syndata (subdomínio/tenant do Voalle).
 * Ref.: wiki.grupovoalle.com.br (Soluções integradas / Financeiro).
 * Ajuste endpoints/campos conforme a versão contratada.
 */
export class VoalleConnector implements SourceConnector {
  readonly system = 'VOALLE';
  private readonly http: AxiosInstance;
  private readonly creds: SourceCredentials;
  private accessToken?: string;

  constructor(creds: SourceCredentials) {
    this.creds = creds;
    this.http = axios.create({ baseURL: creds.urlBase.replace(/\/$/, ''), timeout: 20000 });
  }

  private async ensureToken(): Promise<void> {
    if (this.accessToken) return;
    const e = this.creds.extra ?? {};
    const { data } = await this.http.post('/security/openid/token', {
      grant_type: 'client_credentials',
      client_id: e.client_id,
      client_secret: e.client_secret,
      scope: 'syngw',
      syndata: e.syndata,
    });
    this.accessToken = data.access_token;
    this.http.defaults.headers.common.Authorization = `Bearer ${this.accessToken}`;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ensureToken();
      return true;
    } catch {
      return false;
    }
  }

  async fetchCustomers(): Promise<SourceCustomer[]> {
    await this.ensureToken();
    const { data } = await this.http.get('/api/v1/persons', { params: { active: true } });
    const rows: any[] = data?.data ?? data?.persons ?? [];
    return rows.map((r) => ({
      externalId: String(r.id),
      nome: r.name ?? r.socialName ?? '',
      doc: onlyDigits(r.cpfCnpj ?? r.document ?? ''),
      email: r.email || undefined,
      telefone: normalizePhoneBR(r.cellphone ?? r.phone ?? ''),
      contrato: r.contractId ? String(r.contractId) : undefined,
    }));
  }

  async fetchOpenInvoices(): Promise<SourceInvoice[]> {
    await this.ensureToken();
    const { data } = await this.http.get('/api/v1/receivables', { params: { status: 'open' } });
    const rows: any[] = data?.data ?? data?.receivables ?? [];
    return rows.map((r) => ({
      externalId: String(r.id),
      customerExternalId: String(r.personId ?? r.customerId),
      valor: Number(r.value ?? r.amount ?? 0),
      vencimento: new Date(r.dueDate),
      status: r.paid ? 'PAGA' : new Date(r.dueDate) < new Date() ? 'VENCIDA' : 'PENDENTE',
      pixCopiaCola: r.pixEmv ?? r.pixCopiaCola ?? undefined,
      boletoLinha: r.digitableLine ?? undefined,
      boletoUrl: r.bankSlipUrl ?? undefined,
    }));
  }
}
