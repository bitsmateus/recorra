import axios, { AxiosInstance } from 'axios';
import { safeHttpAgents } from '@/common/net/safe-http';
import {
  SourceConnector,
  SourceCustomer,
  SourceInvoice,
  SourceCredentials,
  venceuAntesDeHoje,
} from '../source-connector.interface';
import { onlyDigits, normalizePhoneBR } from '@/common/util/normalize';

/**
 * Situação cadastral do contrato a partir do registro de `/api/v1/persons`.
 *
 * ATENÇÃO: a Voalle não documenta publicamente um campo único e estável para
 * isso no payload de pessoas — nomes de campo variam por versão/plano
 * contratado. Esta função tenta os candidatos mais prováveis (contrato
 * embutido na pessoa, ou um campo de status/situação solto) como melhor
 * esforço. **Precisa ser validada com uma resposta real da API do tenant**
 * (rode uma sincronização e confira `statusContrato` no cliente); se vier
 * sempre vazio, o campo certo é outro e este mapeamento deve ser ajustado.
 */
export function statusContratoDoPerson(r: any): string | undefined {
  const bruto =
    r.contractStatus ?? r.contract?.status ?? r.situacaoContrato ??
    r.situacao ?? r.status ?? undefined;
  if (bruto === undefined || bruto === null) return undefined;
  return String(bruto).trim() || undefined;
}

/**
 * Conector Voalle (ERP Grupo Voalle).
 * API REST com OAuth2 (client_credentials). `extra` deve conter
 * client_id, client_secret e syndata (subdomínio/tenant do Voalle).
 * Ref.: wiki.grupovoalle.com.br (Soluções integradas / Financeiro).
 * Ajuste endpoints/campos conforme a versão contratada.
 */
export class VoalleConnector implements SourceConnector {
  readonly system = 'VOALLE';
  // Chamada única sem paginação confirmada — conciliação por ausência desligada até validar.
  readonly snapshotCompleto = false;
  private readonly http: AxiosInstance;
  private readonly creds: SourceCredentials;
  private accessToken?: string;

  constructor(creds: SourceCredentials) {
    this.creds = creds;
    this.http = axios.create({ ...safeHttpAgents(), baseURL: creds.urlBase.replace(/\/$/, ''), timeout: 20000 });
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
      statusContrato: statusContratoDoPerson(r),
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
      status: r.paid ? 'PAGA' : venceuAntesDeHoje(new Date(r.dueDate)) ? 'VENCIDA' : 'PENDENTE',
      pixCopiaCola: r.pixEmv ?? r.pixCopiaCola ?? undefined,
      boletoLinha: r.digitableLine ?? undefined,
      boletoUrl: r.bankSlipUrl ?? undefined,
    }));
  }
}
