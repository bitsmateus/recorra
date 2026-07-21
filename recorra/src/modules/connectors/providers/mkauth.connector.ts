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
 * Conector MK-Auth.
 * O MK-Auth expõe uma API própria (Bearer token) após habilitar o módulo/add-on
 * de integração no servidor. Endpoints típicos: /api/clientes, /api/faturas.
 * Ajuste conforme a versão instalada no cliente.
 */
export class MkAuthConnector implements SourceConnector {
  readonly system = 'MKAUTH';
  // Chamada única sem paginação confirmada — conciliação por ausência desligada até validar.
  readonly snapshotCompleto = false;
  private readonly http: AxiosInstance;

  constructor(creds: SourceCredentials) {
    this.http = axios.create({
      ...safeHttpAgents(),
      baseURL: creds.urlBase.replace(/\/$/, '') + '/api',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.http.get('/clientes', { params: { limit: 1 } });
      return true;
    } catch {
      return false;
    }
  }

  async fetchCustomers(): Promise<SourceCustomer[]> {
    const { data } = await this.http.get('/clientes');
    const rows: any[] = Array.isArray(data) ? data : (data?.clientes ?? []);
    return rows.map((r) => ({
      externalId: String(r.id ?? r.login),
      nome: r.nome ?? '',
      doc: onlyDigits(r.cpf_cnpj ?? r.cpf ?? r.cnpj ?? ''),
      email: r.email || undefined,
      telefone: normalizePhoneBR(r.celular ?? r.fone ?? ''),
      contrato: r.login ? String(r.login) : undefined,
    }));
  }

  async fetchOpenInvoices(): Promise<SourceInvoice[]> {
    const { data } = await this.http.get('/faturas', { params: { status: 'aberto' } });
    const rows: any[] = Array.isArray(data) ? data : (data?.faturas ?? []);
    return rows.map((r) => ({
      externalId: String(r.uuid ?? r.id),
      customerExternalId: String(r.id_cliente ?? r.login),
      valor: Number(r.valor ?? 0),
      vencimento: new Date(r.datavenc ?? r.data_vencimento),
      status: r.datapag ? 'PAGA' : new Date(r.datavenc) < new Date() ? 'VENCIDA' : 'PENDENTE',
      pixCopiaCola: r.pix ?? undefined,
      boletoLinha: r.linhadigitavel ?? undefined,
      boletoUrl: r.url ?? undefined,
    }));
  }
}
