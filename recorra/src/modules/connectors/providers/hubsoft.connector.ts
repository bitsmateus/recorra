import axios, { AxiosInstance } from 'axios';
import { safeHttpAgents } from '@/common/net/safe-http';
import {
  SourceConnector,
  SourceCustomer,
  SourceInvoice,
  SourceCredentials,
} from '../source-connector.interface';
import { onlyDigits, normalizePhoneBR } from '@/common/util/normalize';

/**
 * Conector HubSoft.
 * API REST com OAuth2 (client_credentials / password grant). Ref.: docs.hubsoft.com.br
 * O token é obtido em /oauth/token e enviado como Bearer.
 * `extra` deve conter client_id, client_secret, username, password.
 */
export class HubsoftConnector implements SourceConnector {
  readonly system = 'HUBSOFT';
  // Chamada única sem paginação confirmada — conciliação por ausência desligada até validar.
  readonly snapshotCompleto = false;
  private readonly http: AxiosInstance;
  private readonly creds: SourceCredentials;
  private accessToken?: string;

  constructor(creds: SourceCredentials) {
    this.creds = creds;
    this.http = axios.create({
      ...safeHttpAgents(),
      baseURL: creds.urlBase.replace(/\/$/, ''),
      timeout: 20000,
    });
  }

  private async ensureToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const e = this.creds.extra ?? {};
    const { data } = await this.http.post('/oauth/token', {
      grant_type: 'password',
      client_id: e.client_id,
      client_secret: e.client_secret,
      username: e.username,
      password: e.password,
    });
    this.accessToken = data.access_token;
    this.http.defaults.headers.common.Authorization = `Bearer ${this.accessToken}`;
    return this.accessToken!;
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
    const { data } = await this.http.get('/api/v1/integracao/cliente', { params: { status: 'ativo' } });
    const rows: any[] = data?.clientes ?? data?.data ?? [];
    return rows.map((r) => ({
      externalId: String(r.id_cliente ?? r.id),
      nome: r.nome_razaosocial ?? r.nome ?? '',
      doc: onlyDigits(r.cpf_cnpj ?? ''),
      email: r.email || undefined,
      telefone: normalizePhoneBR(r.telefone_celular ?? r.telefone ?? ''),
      contrato: r.id_cliente_servico ? String(r.id_cliente_servico) : undefined,
    }));
  }

  async fetchOpenInvoices(): Promise<SourceInvoice[]> {
    await this.ensureToken();
    const { data } = await this.http.get('/api/v1/integracao/financeiro', {
      params: { tipo: 'aberto' },
    });
    const rows: any[] = data?.faturas ?? data?.financeiro ?? data?.data ?? [];
    return rows.map((r) => ({
      externalId: String(r.id_fatura ?? r.id),
      customerExternalId: String(r.id_cliente),
      valor: Number(r.valor ?? r.valor_total ?? 0),
      vencimento: new Date(r.data_vencimento),
      status: r.pago || r.status === 'pago' ? 'PAGA' : new Date(r.data_vencimento) < new Date() ? 'VENCIDA' : 'PENDENTE',
      pixCopiaCola: r.pix_copia_cola ?? r.codigo_pix ?? undefined,
      boletoLinha: r.linha_digitavel ?? undefined,
      boletoUrl: r.link_boleto ?? r.url ?? undefined,
    }));
  }
}
