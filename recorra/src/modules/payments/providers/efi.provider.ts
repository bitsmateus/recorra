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
 * Gateway Efí (Efipay / Gerencianet).
 * Pix via API BACEN (OAuth2 client_credentials sobre mTLS). Docs: dev.efipay.com.br
 *
 * A Efí EXIGE certificado de cliente (.p12/.pem) no handshake TLS em TODAS as
 * chamadas — inclusive o /oauth/token. Sem o certificado, a Efí recusa a conexão.
 * O certificado gerado no painel da Efí normalmente NÃO tem senha (deixe em branco).
 *
 * Credenciais (campos próprios, com retrocompatibilidade ao formato antigo):
 *  - clientId / clientSecret  (fallback: apiKey no formato "Client_Id:Client_Secret")
 *  - pixKey                   chave Pix recebedora (fallback: webhookToken)
 *  - certBase64 / certPassword  certificado .p12/.pem do cliente
 */
export class EfiProvider implements PaymentProvider {
  readonly type = 'EFI';
  private readonly creds: ProviderCredentials;
  private readonly baseURL: string;
  private readonly agent: https.Agent;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly pixKey: string;
  private http?: AxiosInstance;
  private token?: string;

  constructor(creds: ProviderCredentials) {
    this.creds = creds;
    this.baseURL = creds.ambiente === 'production' ? 'https://pix.api.efipay.com.br' : 'https://pix-h.api.efipay.com.br';
    // Certificado de cliente (.p12/.pfx) para o mTLS. Sem ele, a Efí recusa a conexão.
    const cert = creds.certBase64 ? Buffer.from(creds.certBase64, 'base64') : undefined;
    this.agent = new https.Agent({ pfx: cert, passphrase: creds.certPassword });
    // clientId/clientSecret dos campos próprios; fallback ao formato legado "id:secret" em apiKey.
    const [legadoId, legadoSecret] = (creds.apiKey ?? '').split(':');
    this.clientId = creds.clientId ?? legadoId ?? '';
    this.clientSecret = creds.clientSecret ?? legadoSecret ?? '';
    // chave Pix recebedora: campo próprio; fallback ao webhookToken (uso legado).
    this.pixKey = creds.pixKey ?? creds.webhookToken ?? '';
  }

  private async auth(): Promise<AxiosInstance> {
    if (this.http && this.token) return this.http;
    if (!this.clientId || !this.clientSecret) throw new Error('Efí: client_id/client_secret não configurados');
    if (!this.creds.certBase64) throw new Error('Efí: certificado (mTLS) não configurado');

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const { data } = await axios.post(
      `${this.baseURL}/oauth/token`,
      { grant_type: 'client_credentials' },
      {
        httpsAgent: this.agent,
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      },
    );
    this.token = data.access_token;

    this.http = axios.create({
      baseURL: this.baseURL,
      httpsAgent: this.agent,
      timeout: 20000,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
    });
    return this.http;
  }

  async testConnection(): Promise<boolean> {
    // O handshake mTLS + OAuth2 (client_credentials) valida certificado e credenciais.
    const http = await this.auth();
    return !!http;
  }

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const http = await this.auth();
    const doc = input.customer.doc.replace(/\D/g, '');
    // cobrança imediata Pix
    const { data: cob } = await http.post('/v2/cob', {
      calendario: { expiracao: 86400 },
      devedor: doc.length > 11 ? { cnpj: doc, nome: input.customer.nome } : { cpf: doc, nome: input.customer.nome },
      valor: { original: input.valor.toFixed(2) },
      chave: this.pixKey,
      solicitacaoPagador: input.descricao ?? 'Cobrança',
    });

    let pixCopiaCola: string | undefined = cob.pixCopiaeCola;
    // se não veio, gera o QR pela location
    if (!pixCopiaCola && cob.loc?.id) {
      const { data: qr } = await http.get(`/v2/loc/${cob.loc.id}/qrcode`);
      pixCopiaCola = qr.qrcode;
    }

    return {
      externalId: cob.txid,
      status: this.normalizeStatus(cob.status),
      pixCopiaCola,
    };
  }

  async getChargeStatus(externalId: string): Promise<ChargeStatusResult> {
    const http = await this.auth();
    const { data } = await http.get(`/v2/cob/${externalId}`);
    return {
      externalId,
      status: this.normalizeStatus(data.status),
      pagoEm: data.pix?.[0]?.horario ? new Date(data.pix[0].horario) : undefined,
    };
  }

  /** Pix copia-e-cola sob demanda (2ª via): busca a cobrança e devolve o BR Code. */
  async getPixCopiaCola(externalId: string): Promise<string | null> {
    try {
      const http = await this.auth();
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
    const http = await this.auth();
    await http.patch(`/v2/cob/${externalId}`, { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' });
  }

  parseWebhook(_headers: Record<string, string>, body: unknown): WebhookParseResult {
    const evt = body as { pix?: { txid?: string; horario?: string }[] };
    const pix = evt.pix?.[0];
    // O webhook Pix da Efí é protegido por mTLS no transporte, não por assinatura
    // no corpo — não dá para validar aqui. Marcamos como NÃO confiável e o
    // controller SEMPRE reconfirma o status via getChargeStatus (autoritativo).
    return {
      valid: false,
      eventType: 'pix',
      externalId: pix?.txid,
      status: undefined,
      pagoEm: pix?.horario ? new Date(pix.horario) : undefined,
      idempotencyKey: `efi:pix:${pix?.txid}:${pix?.horario}`,
    };
  }

  private normalizeStatus(s: string): string {
    const map: Record<string, string> = {
      ATIVA: 'PENDENTE',
      CONCLUIDA: 'PAGA',
      REMOVIDA_PELO_USUARIO_RECEBEDOR: 'CANCELADA',
      REMOVIDA_PELO_PSP: 'CANCELADA',
    };
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
      status: this.normalizeStatus(c.status),
      metodo: 'PIX',
      descricao: c?.solicitacaoPagador ?? undefined,
      pixCopiaCola: c?.pixCopiaeCola ?? undefined,
      pagoEm: c?.pix?.[0]?.horario ? new Date(c.pix[0].horario) : undefined,
    };
  }

  /** Lista as cobranças Pix (/v2/cob) do último ano, paginando. Requer OAuth2 + mTLS. */
  private async buscarCobs(): Promise<any[]> {
    const http = await this.auth();
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
    try {
      const http = await this.auth();
      const { data } = await http.get(`/v2/cob/${externalId}`);
      if (!data?.txid) return null;
      return this.mapCob(data);
    } catch {
      return null;
    }
  }
}
