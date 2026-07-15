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
 * Conector SGP.
 * Autenticação por token gerado em Administração > Integrações > Tokens.
 * A API do SGP costuma receber `app`, `token` e `contrato/cpfcnpj` no corpo.
 * Endpoints (ajuste conforme a instância): /api/ura/clientes, /api/ura/titulos.
 * Ref.: bookstack.sgp.net.br/books/api
 */
export class SgpConnector implements SourceConnector {
  readonly system = 'SGP';
  private readonly http: AxiosInstance;
  private readonly app: string;
  private readonly token: string;

  constructor(creds: SourceCredentials) {
    this.http = axios.create({
      ...safeHttpAgents(),
      baseURL: creds.urlBase.replace(/\/$/, ''),
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    });
    this.app = creds.extra?.app ?? 'recorra';
    this.token = creds.token;
  }

  private auth() {
    return { app: this.app, token: this.token };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.http.post('/api/ura/consultacliente', { ...this.auth(), limit: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async fetchCustomers(): Promise<SourceCustomer[]> {
    const { data } = await this.http.post('/api/ura/consultacliente', { ...this.auth() });
    const rows: any[] = data?.clientes ?? data?.dados ?? [];
    return rows.map((r) => ({
      externalId: String(r.id ?? r.cliente_id),
      nome: r.nome ?? r.razaosocial ?? '',
      doc: onlyDigits(r.cpfcnpj ?? r.cnpj_cpf ?? ''),
      email: r.email || undefined,
      telefone: normalizePhoneBR(r.celular ?? r.telefone ?? ''),
      contrato: r.contrato ? String(r.contrato) : undefined,
    }));
  }

  async fetchOpenInvoices(): Promise<SourceInvoice[]> {
    const { data } = await this.http.post('/api/ura/titulos', { ...this.auth(), status: 'aberto' });
    const rows: any[] = data?.titulos ?? data?.dados ?? [];
    return rows.map((r) => ({
      externalId: String(r.id ?? r.titulo_id),
      customerExternalId: String(r.cliente_id ?? r.cliente),
      valor: Number(r.valor ?? 0),
      vencimento: new Date(r.vencimento ?? r.data_vencimento),
      status: r.pago ? 'PAGA' : new Date(r.vencimento) < new Date() ? 'VENCIDA' : 'PENDENTE',
      pixCopiaCola: r.pix ?? r.pix_copia_cola ?? undefined,
      boletoLinha: r.linhadigitavel ?? r.linha_digitavel ?? undefined,
      boletoUrl: r.linkboleto ?? r.url_boleto ?? undefined,
    }));
  }
}
