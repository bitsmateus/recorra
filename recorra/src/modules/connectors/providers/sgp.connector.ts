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
 * Endpoint: /api/ura/clientes/ (títulos vêm aninhados no cliente com status=aberto).
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
  private readonly baseUrl: string;

  // A documentação pública do SGP limita /api/ura/clientes/ a 100 por página.
  private static readonly LIMIT = 100;
  private static readonly MAX_PAGES = 400;

  constructor(creds: SourceCredentials) {
    this.baseUrl = creds.urlBase.replace(/\/$/, '');
    this.http = axios.create({
      ...safeHttpAgents(),
      baseURL: this.baseUrl,
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
    if (!status) {
      // Sem response = DNS, TLS, timeout ou conexão recusada. Expor somente o
      // código e a mensagem do transporte; config/headers (com token) nunca vão
      // para a interface.
      const transporte = [e.code, e.message].filter(Boolean).join(' — ');
      return new Error(`Não foi possível conectar ao SGP ${endpoint}${transporte ? `: ${transporte}` : ''}`);
    }
    return new Error(`SGP ${endpoint} respondeu ${status}${sufixo}`);
  }

  private validarResposta(endpoint: string, data: any): void {
    const detalhe = data?.detail ?? data?.message ?? data?.mensagem ?? data?.error ?? data?.erro;
    if (detalhe && data?.success !== true && data?.sucesso !== true) {
      throw new Error(`SGP ${endpoint}: ${String(detalhe).slice(0, 300)}`);
    }
  }

  /**
   * Propaga o motivo da falha em vez de devolver só `false`: sem isso a tela
   * mostrava "Falha na conexão" sem dizer se foi token, rede ou endpoint.
   */
  async testConnection(): Promise<boolean> {
    const endpoint = '/api/ura/clientes/';
    let data: unknown;
    try {
      ({ data } = await this.http.post(endpoint, {
        ...this.auth(), limit: 1, omitir_contratos: true, omitir_titulos: true,
      }));
    } catch (e) {
      throw this.erro(endpoint, e);
    }
    this.validarResposta(endpoint, data);
    if (!Array.isArray((data as { clientes?: unknown })?.clientes)) {
      throw new Error(`SGP ${endpoint}: resposta sem a lista "clientes" — confira a URL base e o token.`);
    }
    return true;
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
        // Página sem a lista esperada. Se já trouxemos dados, tratamos como fim
        // (sem garantir completude); na 1ª página é erro de endpoint/token — e aí
        // mostramos o formato que veio, em vez de um "não reconhecido" cego.
        if (out.length > 0) return { rows: out, completo: false };
        const forma = data && typeof data === 'object'
          ? `chaves recebidas: ${Object.keys(data).slice(0, 10).join(', ') || '(objeto vazio)'}`
          : `tipo recebido: ${typeof data}`;
        throw new Error(`SGP ${endpoint}: resposta sem a lista de dados esperada (${forma}). Confira se o endpoint e o token estão corretos para esta instância.`);
      }
      if (rows.length === 0) return { rows: out, completo: true };

      let novos = 0;
      for (const r of rows) {
        // Cliente no SGP nem sempre traz `id`; CPF/CNPJ é estável e também é o
        // fallback usado para vincular os títulos aninhados ao cliente local.
        const id = String(r.id ?? r.titulo_id ?? r.cliente_id ?? onlyDigits(r.cpfcnpj ?? ''));
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
    const { rows } = await this.paginar(
      '/api/ura/clientes/',
      { omitir_contratos: true, omitir_titulos: true },
      (d) => d?.clientes,
    );
    return rows.map((r) => ({
      externalId: String(r.id ?? r.cliente_id ?? onlyDigits(r.cpfcnpj ?? '')),
      nome: r.nome ?? r.razaosocial ?? '',
      doc: onlyDigits(r.cpfcnpj ?? r.cnpj_cpf ?? ''),
      email: r.email ?? r.contatos?.emails?.[0] ?? undefined,
      telefone: normalizePhoneBR(r.celular ?? r.telefone ?? r.contatos?.celulares?.[0] ?? r.contatos?.telefones?.[0] ?? ''),
      contrato: r.contrato
        ? String(r.contrato)
        : r.contratos?.[0]?.contrato != null ? String(r.contratos[0].contrato) : undefined,
    }));
  }

  async fetchOpenInvoices(): Promise<SourceInvoice[]> {
    // O endpoint em lote do SGP devolve os títulos aninhados em cada cliente.
    // Paginar clientes (e não títulos) garante que nenhuma cobrança fique fora.
    const { rows: clientes, completo } = await this.paginar(
      '/api/ura/clientes/',
      { status: 'aberto', omitir_contratos: true },
      (d) => d?.clientes,
    );
    this.snapshotCompleto = completo;
    return clientes.flatMap((cliente) => {
      const customerExternalId = String(
        cliente.id ?? cliente.cliente_id ?? onlyDigits(cliente.cpfcnpj ?? ''),
      );
      const titulos: any[] = Array.isArray(cliente.titulos) ? cliente.titulos : [];
      return titulos.map((r) => {
      const vencimento = new Date(r.vencimento ?? r.data_vencimento ?? r.dataVencimento);
      const statusId = Number(r.statusid ?? r.status_id);
      const statusTexto = String(r.status ?? '').toLowerCase();
      const paga = r.pago === true || statusId === 2 || statusTexto === 'pago' || !!(r.dataPagamento ?? r.data_pagamento);
      const link = r.linkboleto ?? r.url_boleto ?? r.link;
      return {
        externalId: String(r.id ?? r.titulo_id),
        customerExternalId,
        valor: Number(r.valor ?? 0),
        vencimento,
        // Usa o mesmo `vencimento` resolvido (não só r.vencimento) e a borda por
        // DIA: vence hoje ainda é pendente; só vira vencida a partir de amanhã.
        status: paga ? 'PAGA' : venceuAntesDeHoje(vencimento) ? 'VENCIDA' : 'PENDENTE',
        pixCopiaCola: r.pix ?? r.pix_copia_cola ?? r.codigoPix ?? r.codigopix ?? undefined,
        boletoLinha: r.linhadigitavel ?? r.linha_digitavel ?? r.codigoBarras ?? undefined,
        boletoUrl: link ? new URL(String(link), `${this.baseUrl}/`).toString() : undefined,
      };
      });
    });
  }
}
