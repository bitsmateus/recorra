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
 * Conector SGP.
 * Autenticação por token gerado em Administração > Integrações > Tokens.
 * A API do SGP costuma receber `app`, `token` e `contrato/cpfcnpj` no corpo.
 * Endpoints (ajuste conforme a instância): /api/ura/clientes, /api/ura/titulos.
 * Ref.: bookstack.sgp.net.br/books/api
 */
export class SgpConnector implements SourceConnector {
  readonly system = 'SGP';
  // Dinâmico: `fetchOpenInvoices` liga isto só quando a paginação chega ao fim.
  // Se a API ignorar o offset (não dá para garantir completude), fica false e a
  // conciliação por ausência é pulada naquela rodada — sem quitar fatura por engano.
  snapshotCompleto = false;
  private readonly http: AxiosInstance;
  private readonly app: string;
  private readonly token: string;

  private static readonly LIMIT = 500;
  private static readonly MAX_PAGES = 400;

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

  /**
   * Mantém a mensagem útil do SGP sem devolver credenciais ou o request inteiro
   * para a interface. O Axios, por padrão, acabava virando apenas HTTP 500.
   */
  private erro(endpoint: string, e: unknown): Error {
    if (!axios.isAxiosError(e)) return e instanceof Error ? e : new Error(String(e));
    const status = e.response?.status;
    const body = e.response?.data;
    const detalhe = typeof body === 'string'
      ? body
      : body?.detail ?? body?.message ?? body?.mensagem ?? body?.error ?? body?.erro;
    const sufixo = detalhe ? `: ${String(detalhe).slice(0, 300)}` : '';
    return new Error(`SGP ${endpoint} respondeu ${status ?? 'sem status'}${sufixo}`);
  }

  private validarResposta(endpoint: string, data: any): void {
    const detalhe = data?.detail ?? data?.message ?? data?.mensagem ?? data?.error ?? data?.erro;
    if (detalhe && data?.success !== true && data?.sucesso !== true) {
      throw new Error(`SGP ${endpoint}: ${String(detalhe).slice(0, 300)}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const { data } = await this.http.post('/api/ura/consultacliente', { ...this.auth(), limit: 1 });
      this.validarResposta('/api/ura/consultacliente', data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pagina um endpoint do SGP por `limit`/`offset`, deduplicando por id. Retorna
   * `completo=true` só se chegou ao fim de forma comprovada (página curta ou
   * vazia). Se a API não avançar com o offset (devolve sempre a mesma página),
   * para e marca `completo=false` — o chamador então não confia na completude.
   */
  private async paginar(
    endpoint: string,
    extra: Record<string, unknown>,
    extrair: (d: any) => any[],
  ): Promise<{ rows: any[]; completo: boolean }> {
    const out: any[] = [];
    const vistos = new Set<string>();
    for (let page = 0; page < SgpConnector.MAX_PAGES; page++) {
      let data: any;
      try {
        ({ data } = await this.http.post(endpoint, {
          ...this.auth(),
          ...extra,
          limit: SgpConnector.LIMIT,
          offset: page * SgpConnector.LIMIT,
        }));
        this.validarResposta(endpoint, data);
      } catch (e) {
        throw this.erro(endpoint, e);
      }
      const rows: any[] = extrair(data);
      if (!Array.isArray(rows)) {
        throw new Error(`SGP ${endpoint}: formato de resposta não reconhecido`);
      }
      if (rows.length === 0) return { rows: out, completo: true };

      let novos = 0;
      for (const r of rows) {
        const id = String(r.id ?? r.titulo_id ?? r.cliente_id ?? '');
        if (id && !vistos.has(id)) { vistos.add(id); out.push(r); novos++; }
      }
      // Página curta = último lote → snapshot completo.
      if (rows.length < SgpConnector.LIMIT) return { rows: out, completo: true };
      // Página cheia mas sem nada novo = offset ignorado → não garante completude.
      if (novos === 0) return { rows: out, completo: false };
    }
    // Estourou o teto de páginas: tem mais do que conseguimos varrer com segurança.
    return { rows: out, completo: false };
  }

  async fetchCustomers(): Promise<SourceCustomer[]> {
    const { rows } = await this.paginar('/api/ura/consultacliente', {}, (d) => d?.clientes ?? d?.dados);
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
    const { rows, completo } = await this.paginar('/api/ura/titulos', { status: 'aberto' }, (d) => d?.titulos ?? d?.dados);
    this.snapshotCompleto = completo;
    return rows.map((r) => {
      const vencimento = new Date(r.vencimento ?? r.data_vencimento);
      return {
        externalId: String(r.id ?? r.titulo_id),
        customerExternalId: String(r.cliente_id ?? r.cliente),
        valor: Number(r.valor ?? 0),
        vencimento,
        // Usa o mesmo `vencimento` resolvido (não só r.vencimento) e a borda por
        // DIA: vence hoje ainda é pendente; só vira vencida a partir de amanhã.
        status: r.pago ? 'PAGA' : venceuAntesDeHoje(vencimento) ? 'VENCIDA' : 'PENDENTE',
        pixCopiaCola: r.pix ?? r.pix_copia_cola ?? undefined,
        boletoLinha: r.linhadigitavel ?? r.linha_digitavel ?? undefined,
        boletoUrl: r.linkboleto ?? r.url_boleto ?? undefined,
      };
    });
  }
}
