import axios, { AxiosInstance } from 'axios';
import { safeHttpAgents } from '@/common/net/safe-http';
import {
  SourceConnector,
  SourceCustomer,
  SourceInvoice,
  SourcePayment,
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
 * Conector Voalle (ERP Grupo Voalle) — API "para Terceiros" (coleção oficial no Postman,
 * documenter.getpostman.com/view/16282829/TzzBqFw1).
 *
 *  - Autenticação: POST {host}:45700/connect/token (OAuth2 client_credentials, form-urlencoded,
 *    scope `syngw`) com client_id/client_secret do usuário "Integrador" e o `syndata` do cliente.
 *  - Dados: {host}:45715/external/integrations/thirdparty/... — resposta no envelope
 *    { success, messages, response }.
 *  - Clientes: getclient (paginado, só page/pageSize).
 *  - Cobranças em aberto: getopentitlesbyexpirationdate (por faixa de vencimento, pageSize ≤ 200).
 *    Só boleto/carnê e SEM pagamento parcial; cada título traz o CPF/CNPJ do cliente (`client.txId`)
 *    e, quando existe, o `contractNumber`.
 *  - Pagamentos: a lista de abertas não traz quem pagou. O motor de sync chama `fetchTitlesByDoc`
 *    (gettitlesbytxid) para as faturas locais que sumiram da lista; ali o título vem com
 *    `billet.status` ("Paga"…) e `billet.receipts.receiptDate` (data do recebimento).
 *
 * `extra`: client_id, client_secret, syndata (obrigatórios); portAuth (45700) e portApi (45715) só
 * se o ambiente usar portas diferentes; diasHistorico (365) = quanto do passado das faturas em aberto
 * buscar. `urlBase` é o endereço do ERP (com ou sem porta — a porta é trocada pela correta).
 */
const PAGE = 200;

/** Troca a porta do endereço-base. Aceita "erp.exemplo.com.br", "https://erp…:8080" etc. */
export function urlComPorta(base: string, porta: string | number): string {
  const limpo = base.trim().replace(/\/+$/, '');
  const comEsquema = /^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`;
  try {
    const u = new URL(comEsquema);
    u.port = String(porta);
    return u.toString().replace(/\/$/, '');
  } catch {
    return comEsquema;
  }
}

const dia = (v: unknown): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00Z` : String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** Status do título da Voalle ("Em aberto" | "Paga" | "Cancelada" | "Vencida") → status do Recorra. */
export function statusDoTitulo(statusErp: unknown, vencimento: Date): string {
  const st = String(statusErp ?? '').trim().toLowerCase();
  if (st === 'paga' || st === 'pago' || st === 'liquidada') return 'PAGA';
  if (st === 'cancelada' || st === 'cancelado') return 'CANCELADA';
  return venceuAntesDeHoje(vencimento) ? 'VENCIDA' : 'PENDENTE';
}

/** Data do recebimento: `receipts` é objeto em gettitlesbytxid e lista nas demais consultas. */
export function dataPagamento(r: any): Date | undefined {
  const rec = r?.billet?.receipts;
  const lista = Array.isArray(rec) ? rec : rec ? [rec] : [];
  const datas = lista.map((x: any) => dia(x?.receiptDate ?? x?.paymentDate)).filter(Boolean) as Date[];
  return datas.length ? new Date(Math.max(...datas.map((x) => x.getTime()))) : undefined;
}

/** Um título da Voalle → fatura normalizada. Puro e testável. */
export function tituloParaFatura(r: any): SourceInvoice | null {
  const b = r?.billet;
  const vencimento = dia(b?.expirationDate);
  if (r?.id === undefined || r?.id === null || !vencimento) return null;
  const valor = Number(b?.amount?.finalValue ?? b?.amount?.value ?? b?.amount?.originalValue ?? 0);
  const status = statusDoTitulo(b?.status, vencimento);
  return {
    externalId: String(r.id),
    customerExternalId: onlyDigits(r?.client?.txId ?? ''),
    customerDoc: onlyDigits(r?.client?.txId ?? ''),
    contrato: r?.contractNumber ? String(r.contractNumber) : undefined,
    valor,
    vencimento,
    status,
    pagoEm: status === 'PAGA' ? dataPagamento(r) : undefined,
    pixCopiaCola: b?.pixQRCode ?? b?.pixQrCode ?? undefined,
    boletoLinha: b?.typefulLine ?? undefined,
  };
}

export class VoalleConnector implements SourceConnector {
  readonly system = 'VOALLE';
  // A lista de abertas é por faixa de vencimento e só traz boleto/carnê sem pagamento parcial:
  // sumir dela NÃO prova pagamento (pode ser parcial, outra forma de cobrança, fora da faixa).
  // Por isso a baixa é confirmada título a título em `fetchTitlesByDoc`.
  readonly snapshotCompleto = false;
  private readonly http: AxiosInstance;
  private readonly creds: SourceCredentials;
  private accessToken?: string;

  constructor(creds: SourceCredentials) {
    this.creds = creds;
    const portApi = creds.extra?.portApi || 45715;
    this.http = axios.create({ ...safeHttpAgents(), baseURL: `${urlComPorta(creds.urlBase, portApi)}/external/integrations/thirdparty`, timeout: 30000 });
  }

  private async ensureToken(): Promise<void> {
    if (this.accessToken) return;
    const e = this.creds.extra ?? {};
    const corpo = new URLSearchParams({
      grant_type: 'client_credentials', scope: 'syngw',
      client_id: e.client_id ?? '', client_secret: e.client_secret ?? '', syndata: e.syndata ?? '',
    });
    const { data } = await axios.post(`${urlComPorta(this.creds.urlBase, e.portAuth || 45700)}/connect/token`, corpo.toString(), {
      ...safeHttpAgents(), timeout: 20000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    this.accessToken = data.access_token;
    this.http.defaults.headers.common.Authorization = `Bearer ${this.accessToken}`;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ensureToken();
      await this.http.get('/getclient', { params: { page: 1, pageSize: 1 } });
      return true;
    } catch {
      return false;
    }
  }

  async fetchCustomers(): Promise<SourceCustomer[]> {
    await this.ensureToken();
    const out: SourceCustomer[] = [];
    for (let page = 1; page <= 1000; page++) {
      const { data } = await this.http.get('/getclient', { params: { page, pageSize: PAGE } });
      if (data?.success === false) throw new Error(`Voalle recusou a lista de clientes: ${data?.messages?.[0]?.message ?? 'erro desconhecido'}`);
      const rows: any[] = data?.response?.data ?? [];
      for (const r of rows) {
        out.push({
          externalId: String(r.id),
          nome: r.name ?? r.name2 ?? '',
          doc: onlyDigits(r.txId ?? ''),
          email: r.email || undefined,
          telefone: normalizePhoneBR(r.cellPhone1 ?? r.cellPhone2 ?? r.phone ?? ''),
        });
      }
      const totalPages = Number(data?.response?.totalPages ?? 0);
      if (rows.length < PAGE || (totalPages && page >= totalPages)) break;
    }
    return out;
  }

  async fetchOpenInvoices(): Promise<SourceInvoice[]> {
    await this.ensureToken();
    const dias = Math.max(30, Number(this.creds.extra?.diasHistorico) || 365);
    const de = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
    const ate = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
    const out: SourceInvoice[] = [];
    for (let page = 1; page <= 1000; page++) {
      const { data } = await this.http.get('/getopentitlesbyexpirationdate', { params: { expirationDateFrom: de, expirationDateTo: ate, page, pageSize: PAGE } });
      if (data?.success === false) throw new Error(`Voalle recusou a lista de faturas: ${data?.messages?.[0]?.message ?? 'erro desconhecido'}`);
      const rows: any[] = data?.response?.data ?? [];
      for (const r of rows) { const f = tituloParaFatura(r); if (f && f.customerDoc) out.push(f); }
      const totalPages = Number(data?.response?.totalPages ?? 0);
      if (rows.length < PAGE || (totalPages && page >= totalPages)) break;
    }
    return out;
  }

  /** Todos os títulos de um cliente (inclusive pagos, com a data do recebimento) — confirma baixas. */
  async fetchTitlesByDoc(doc: string): Promise<SourceInvoice[]> {
    await this.ensureToken();
    const { data } = await this.http.get(`/gettitlesbytxid/${onlyDigits(doc)}`);
    if (data?.success === false) return []; // "Registro não encontrado."
    const rows: any[] = Array.isArray(data?.response) ? data.response : [];
    return rows.map(tituloParaFatura).filter(Boolean) as SourceInvoice[];
  }

  /** 2ª via: link público do boleto (portal do cliente). O Pix já vem na lista de títulos. */
  async fetchInvoicePayment(sourceExternalId: string): Promise<SourcePayment | null> {
    await this.ensureToken();
    const { data } = await this.http.get(`/GetBilletLink/${sourceExternalId}`);
    const link = data?.response?.link;
    return link ? { boletoUrl: link, linkPagamento: link } : null;
  }
}
