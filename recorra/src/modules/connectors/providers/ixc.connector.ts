import axios, { AxiosInstance } from 'axios';
import {
  SourceConnector,
  SourceCustomer,
  SourceInvoice,
  SourceCredentials,
} from '../source-connector.interface';
import { onlyDigits } from '@/common/util/normalize';
import { safeHttpAgents } from '@/common/net/safe-http';

/**
 * Conector IXC Soft.
 * A API do IXC usa autenticação Basic com token e o header `ixcsoft: listar`
 * para consultas. Endpoints principais:
 *   - /cliente        → clientes
 *   - /fn_areceber    → contas a receber (faturas/boletos, com Pix e linha digitável)
 *
 * Referências: wiki.ixcsoft.com.br (API REST + rotinas financeiro/pix).
 * Observação: os nomes de campos podem variar por versão do IXC; ajuste o
 * mapeamento conforme a instância do cliente no onboarding.
 */
export class IxcConnector implements SourceConnector {
  readonly system = 'IXC';
  private readonly http: AxiosInstance;

  constructor(creds: SourceCredentials) {
    this.http = axios.create({
      ...safeHttpAgents(),
      baseURL: creds.urlBase.replace(/\/$/, '') + '/webservice/v1',
      headers: {
        // IXC: Authorization Basic base64(token:) — token no usuário, senha vazia.
        Authorization: 'Basic ' + Buffer.from(`${creds.token}:`).toString('base64'),
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.http.post('/cliente', { qtype: 'cliente.id', query: '1', oper: '=', page: '1', rp: '1' }, {
        headers: { ixcsoft: 'listar' },
      });
      return true;
    } catch {
      return false;
    }
  }

  async fetchCustomers(): Promise<SourceCustomer[]> {
    const { data } = await this.http.post(
      '/cliente',
      { qtype: 'cliente.ativo', query: 'S', oper: '=', page: '1', rp: '1000', sortname: 'cliente.id', sortorder: 'asc' },
      { headers: { ixcsoft: 'listar' } },
    );
    const rows: any[] = data?.registros ?? [];
    return rows.map((r) => ({
      externalId: String(r.id),
      nome: r.razao ?? r.fantasia ?? '',
      doc: onlyDigits(r.cnpj_cpf ?? ''),
      email: r.email || undefined,
      telefone: this.normalizePhone(r.telefone_celular ?? r.whatsapp ?? r.fone ?? ''),
      contrato: r.id_contrato ? String(r.id_contrato) : undefined,
    }));
  }

  async fetchOpenInvoices(): Promise<SourceInvoice[]> {
    // status 'A' = aberto no contas a receber do IXC
    const { data } = await this.http.post(
      '/fn_areceber',
      { qtype: 'fn_areceber.status', query: 'A', oper: '=', page: '1', rp: '2000', sortname: 'fn_areceber.data_vencimento', sortorder: 'asc' },
      { headers: { ixcsoft: 'listar' } },
    );
    const rows: any[] = data?.registros ?? [];
    return rows.map((r) => ({
      externalId: String(r.id),
      customerExternalId: String(r.id_cliente),
      valor: Number(r.valor ?? 0),
      vencimento: new Date(r.data_vencimento),
      status: this.mapStatus(r.status, r.data_vencimento),
      pixCopiaCola: r.pix_copia_cola || r.emv || undefined,
      boletoLinha: r.linha_digitavel || undefined,
      boletoUrl: r.url_boleto || undefined,
    }));
  }

  private mapStatus(status: string, vencimento: string): string {
    if (status === 'R') return 'PAGA';
    if (new Date(vencimento) < new Date()) return 'VENCIDA';
    return 'PENDENTE';
  }

  private normalizePhone(v: string): string | undefined {
    const d = onlyDigits(v);
    if (!d) return undefined;
    return d.startsWith('55') ? d : `55${d}`;
  }
}
