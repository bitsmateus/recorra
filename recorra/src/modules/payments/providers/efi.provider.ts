import axios, { AxiosInstance } from 'axios';
import * as https from 'node:https';
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

/**
 * Gateway Efí (Efipay / Gerencianet). Duas APIs sob as mesmas credenciais de
 * aplicação (Client ID/Secret) — a aplicação precisa ter AMBAS habilitadas:
 *
 *  - API Pix (BACEN): cobrança Pix imediata (/v2/cob). Exige certificado mTLS
 *    em TODAS as chamadas (inclusive /oauth/token). Docs: dev.efipay.com.br.
 *  - API de Cobranças (Emissões): BOLETO (/v1/charge/one-step). NÃO usa mTLS —
 *    só OAuth2 (client_credentials) em host próprio (cobrancas.api...).
 *
 * O método da cobrança decide a API: BOLETO → Cobranças; Pix/demais → Pix.
 * O status/cancelamento roteiam pelo formato do externalId: id de boleto é
 * numérico (charge_id); txid Pix é alfanumérico de 26+ chars.
 *
 * Credenciais (campos próprios, com retrocompatibilidade ao formato antigo):
 *  - clientId / clientSecret  (fallback: apiKey no formato "Client_Id:Client_Secret")
 *  - pixKey                   chave Pix recebedora (fallback: webhookToken)
 *  - certBase64 / certPassword  certificado .p12/.pem do cliente (só Pix)
 */
export class EfiProvider implements PaymentProvider {
  readonly type = 'EFI';
  private readonly creds: ProviderCredentials;
  private readonly pixBaseURL: string;
  private readonly cobBaseURL: string;
  private readonly agent: https.Agent;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly pixKey: string;
  private pixHttp?: AxiosInstance;
  private cobHttp?: AxiosInstance;

  constructor(creds: ProviderCredentials) {
    this.creds = creds;
    const prod = creds.ambiente === 'production';
    this.pixBaseURL = prod ? 'https://pix.api.efipay.com.br' : 'https://pix-h.api.efipay.com.br';
    this.cobBaseURL = prod ? 'https://cobrancas.api.efipay.com.br' : 'https://cobrancas-h.api.efipay.com.br';
    // Certificado de cliente (.p12/.pfx) para o mTLS do Pix. Sem ele, a Efí recusa a conexão Pix.
    const cert = creds.certBase64 ? Buffer.from(creds.certBase64, 'base64') : undefined;
    this.agent = new https.Agent({ pfx: cert, passphrase: creds.certPassword });
    // clientId/clientSecret dos campos próprios; fallback ao formato legado "id:secret" em apiKey.
    const [legadoId, legadoSecret] = (creds.apiKey ?? '').split(':');
    this.clientId = creds.clientId ?? legadoId ?? '';
    this.clientSecret = creds.clientSecret ?? legadoSecret ?? '';
    // chave Pix recebedora: campo próprio; fallback ao webhookToken (uso legado).
    this.pixKey = creds.pixKey ?? creds.webhookToken ?? '';
  }

  /** Boleto/charge da Efí tem id numérico; txid Pix é alfanumérico longo. */
  private ehBoleto(externalId: string): boolean {
    return /^\d+$/.test(externalId);
  }

  private basic(): string {
    return Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
  }

  private exigirCredenciais() {
    if (!this.clientId || !this.clientSecret) throw new Error('Efí: client_id/client_secret não configurados');
  }

  /** Cliente HTTP autenticado da API Pix (mTLS + OAuth2). */
  private async pixApi(): Promise<AxiosInstance> {
    if (this.pixHttp) return this.pixHttp;
    this.exigirCredenciais();
    if (!this.creds.certBase64) throw new Error('Efí: certificado (mTLS) não configurado');
    const { data } = await axios.post(
      `${this.pixBaseURL}/oauth/token`,
      { grant_type: 'client_credentials' },
      { httpsAgent: this.agent, headers: { Authorization: `Basic ${this.basic()}`, 'Content-Type': 'application/json' }, timeout: 20000 },
    );
    this.pixHttp = axios.create({
      baseURL: this.pixBaseURL,
      httpsAgent: this.agent,
      timeout: 20000,
      headers: { Authorization: `Bearer ${data.access_token}`, 'Content-Type': 'application/json' },
    });
    return this.pixHttp;
  }

  /** Cliente HTTP autenticado da API de Cobranças/boleto (OAuth2, SEM mTLS). */
  private async cobApi(): Promise<AxiosInstance> {
    if (this.cobHttp) return this.cobHttp;
    this.exigirCredenciais();
    const { data } = await axios.post(
      `${this.cobBaseURL}/v1/authorize`,
      { grant_type: 'client_credentials' },
      { headers: { Authorization: `Basic ${this.basic()}`, 'Content-Type': 'application/json' }, timeout: 20000 },
    );
    this.cobHttp = axios.create({
      baseURL: this.cobBaseURL,
      timeout: 20000,
      headers: { Authorization: `Bearer ${data.access_token}`, 'Content-Type': 'application/json' },
    });
    return this.cobHttp;
  }

  async testConnection(): Promise<boolean> {
    // O handshake mTLS + OAuth2 valida certificado e credenciais da API Pix.
    const http = await this.pixApi();
    return !!http;
  }

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    if (input.metodo === 'BOLETO') return this.criarBoleto(input);
    return this.criarPix(input);
  }

  /** Cobrança Pix imediata (/v2/cob) via API Pix (mTLS). */
  private async criarPix(input: CreateChargeInput): Promise<CreateChargeResult> {
    const http = await this.pixApi();
    const doc = input.customer.doc.replace(/\D/g, '');
    const { data: cob } = await http.post('/v2/cob', {
      calendario: { expiracao: 86400 },
      devedor: doc.length > 11 ? { cnpj: doc, nome: input.customer.nome } : { cpf: doc, nome: input.customer.nome },
      valor: { original: input.valor.toFixed(2) },
      chave: this.pixKey,
      solicitacaoPagador: input.descricao ?? 'Cobrança',
    });
    let pixCopiaCola: string | undefined = cob.pixCopiaeCola;
    if (!pixCopiaCola && cob.loc?.id) {
      const { data: qr } = await http.get(`/v2/loc/${cob.loc.id}/qrcode`);
      pixCopiaCola = qr.qrcode;
    }
    return { externalId: cob.txid, status: this.normalizeStatusPix(cob.status), pixCopiaCola };
  }

  /** Boleto (/v1/charge/one-step) via API de Cobranças (sem mTLS). */
  private async criarBoleto(input: CreateChargeInput): Promise<CreateChargeResult> {
    const http = await this.cobApi();
    const doc = input.customer.doc.replace(/\D/g, '');
    const tel = input.customer.telefone?.replace(/\D/g, '');
    const { data } = await http.post('/v1/charge/one-step', {
      items: [{ name: input.descricao ?? 'Cobrança', value: Math.round(input.valor * 100), amount: 1 }],
      payment: {
        banking_billet: {
          expire_at: input.vencimento.toISOString().slice(0, 10),
          customer: {
            name: input.customer.nome,
            ...(doc.length > 11 ? { juridical_person: { corporate_name: input.customer.nome, cnpj: doc } } : { cpf: doc }),
            ...(input.customer.email ? { email: input.customer.email } : {}),
            ...(tel ? { phone_number: tel } : {}),
          },
        },
      },
    });
    const c = data?.data ?? {};
    const billet = c?.payment?.banking_billet ?? {};
    return {
      externalId: String(c.charge_id),
      status: this.normalizeStatusBoleto(c.status),
      boletoLinha: billet.barcode ?? c.barcode ?? undefined,
      boletoUrl: c?.pdf?.charge ?? billet.pdf?.charge ?? undefined,
      linkPagamento: billet.link ?? c.link ?? undefined,
      pixCopiaCola: billet.pix?.qrcode ?? undefined, // boleto híbrido, quando disponível
    };
  }

  async getChargeStatus(externalId: string): Promise<ChargeStatusResult> {
    if (this.ehBoleto(externalId)) {
      const http = await this.cobApi();
      const { data } = await http.get(`/v1/charge/${externalId}`);
      const c = data?.data ?? {};
      return { externalId, status: this.normalizeStatusBoleto(c.status), pagoEm: c.payment?.paid_at ? new Date(c.payment.paid_at) : undefined };
    }
    const http = await this.pixApi();
    const { data } = await http.get(`/v2/cob/${externalId}`);
    return { externalId, status: this.normalizeStatusPix(data.status), pagoEm: data.pix?.[0]?.horario ? new Date(data.pix[0].horario) : undefined };
  }

  /** Pix copia-e-cola sob demanda (2ª via) — só para cobranças Pix. */
  async getPixCopiaCola(externalId: string): Promise<string | null> {
    if (this.ehBoleto(externalId)) return null;
    try {
      const http = await this.pixApi();
      const { data } = await http.get(`/v2/cob/${externalId}`);
      if (data?.pixCopiaeCola) return data.pixCopiaeCola;
      if (data?.loc?.id) {
        const { data: qr } = await http.get(`/v2/loc/${data.loc.id}/qrcode`);
        return qr?.qrcode ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async cancelCharge(externalId: string): Promise<void> {
    if (this.ehBoleto(externalId)) {
      const http = await this.cobApi();
      await http.put(`/v1/charge/${externalId}/cancel`);
      return;
    }
    const http = await this.pixApi();
    await http.patch(`/v2/cob/${externalId}`, { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' });
  }

  /**
   * Registra a URL de webhook Pix na Efí (PUT /v2/webhook/{chave}). Requer mTLS.
   * `x-skip-mtls-checking: true` dispensa o nosso endpoint de apresentar certificado
   * de cliente na chamada de retorno (a Efí, por padrão, exigiria mTLS no callback).
   */
  async registerWebhook(url: string): Promise<void> {
    if (!this.pixKey) throw new Error('Efí: chave Pix não configurada — necessária para registrar o webhook');
    const http = await this.pixApi();
    await http.put(`/v2/webhook/${encodeURIComponent(this.pixKey)}`, { webhookUrl: url }, { headers: { 'x-skip-mtls-checking': 'true' } });
  }

  parseWebhook(_headers: Record<string, string>, body: unknown): WebhookParseResult {
    // O webhook da Efí é protegido por mTLS no transporte, não por assinatura no
    // corpo — não dá para validar aqui. Marcamos como NÃO confiável e o controller
    // SEMPRE reconfirma o status via getChargeStatus (autoritativo).
    // Aceita tanto o formato Pix (evt.pix[]) quanto o de Cobranças/boleto (charge_id).
    const evt = body as { pix?: { txid?: string; horario?: string }[]; charge_id?: number | string; identifiers?: { charge_id?: number | string } };
    const pix = evt.pix?.[0];
    const chargeId = evt.charge_id ?? evt.identifiers?.charge_id;
    const externalId = pix?.txid ?? (chargeId != null ? String(chargeId) : undefined);
    return {
      valid: false,
      eventType: pix ? 'pix' : 'boleto',
      externalId,
      status: undefined,
      pagoEm: pix?.horario ? new Date(pix.horario) : undefined,
      idempotencyKey: `efi:${pix ? `pix:${pix.txid}:${pix.horario}` : `cob:${externalId}`}`,
    };
  }

  private normalizeStatusPix(s: string): string {
    const map: Record<string, string> = {
      ATIVA: 'PENDENTE',
      CONCLUIDA: 'PAGA',
      REMOVIDA_PELO_USUARIO_RECEBEDOR: 'CANCELADA',
      REMOVIDA_PELO_PSP: 'CANCELADA',
    };
    return map[s] ?? 'PENDENTE';
  }

  private normalizeStatusBoleto(s: string): string {
    const map: Record<string, string> = {
      paid: 'PAGA',
      settled: 'PAGA',
      canceled: 'CANCELADA',
      expired: 'CANCELADA',
      refunded: 'ESTORNADA',
    };
    // new, waiting, unpaid, identified, link, contested, held → PENDENTE
    return map[s] ?? 'PENDENTE';
  }

  supportsImport(): boolean {
    return true;
  }

  private docDaCob(c: any): string {
    return String(c?.devedor?.cpf ?? c?.devedor?.cnpj ?? '').replace(/\D/g, '');
  }

  private mapCob(c: any): ImportedPayment {
    const criacao = c?.calendario?.criacao ? new Date(c.calendario.criacao) : new Date();
    const exp = Number(c?.calendario?.expiracao ?? 0);
    return {
      externalId: c.txid,
      customerExternalId: this.docDaCob(c),
      valor: Number(c?.valor?.original ?? 0),
      vencimento: exp ? new Date(criacao.getTime() + exp * 1000) : criacao,
      status: this.normalizeStatusPix(c.status),
      metodo: 'PIX',
      descricao: c?.solicitacaoPagador ?? undefined,
      pixCopiaCola: c?.pixCopiaeCola ?? undefined,
      pagoEm: c?.pix?.[0]?.horario ? new Date(c.pix[0].horario) : undefined,
    };
  }

  /** Lista as cobranças Pix (/v2/cob) do último ano, paginando. Requer OAuth2 + mTLS. */
  private async buscarCobs(): Promise<any[]> {
    const http = await this.pixApi();
    const fim = new Date();
    const inicio = new Date(fim.getTime() - 365 * 86400000);
    const out: any[] = [];
    let pagina = 0;
    for (let i = 0; i < 200; i++) {
      const { data } = await http.get('/v2/cob', {
        params: {
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
          'paginacao.paginaAtual': pagina,
          'paginacao.itensPorPagina': 100,
        },
      });
      const cobs: any[] = data?.cobs ?? [];
      out.push(...cobs);
      const totalPaginas = data?.parametros?.paginacao?.quantidadeDePaginas ?? 1;
      pagina += 1;
      if (cobs.length === 0 || pagina >= totalPaginas) break;
    }
    return out;
  }

  async listCustomers(): Promise<ImportedCustomer[]> {
    const cobs = await this.buscarCobs();
    const porDoc = new Map<string, ImportedCustomer>();
    for (const c of cobs) {
      const doc = this.docDaCob(c);
      if (!doc || porDoc.has(doc)) continue;
      porDoc.set(doc, { externalId: doc, nome: c?.devedor?.nome || doc, doc });
    }
    return [...porDoc.values()];
  }

  async listPayments(): Promise<ImportedPayment[]> {
    const cobs = await this.buscarCobs();
    return cobs.filter((c) => this.docDaCob(c)).map((c) => this.mapCob(c));
  }

  async getChargeDetail(externalId: string): Promise<ImportedPayment | null> {
    if (this.ehBoleto(externalId)) return null; // detalhe individual de boleto não entra na importação em lote
    try {
      const http = await this.pixApi();
      const { data } = await http.get(`/v2/cob/${externalId}`);
      if (!data?.txid) return null;
      return this.mapCob(data);
    } catch {
      return null;
    }
  }
}
