import axios, { AxiosInstance } from 'axios';
import * as https from 'node:https';
import {
  PaymentProvider,
  CreateChargeInput,
  CreateChargeResult,
  ChargeStatusResult,
  WebhookParseResult,
  ProviderCredentials,
} from '../payment-provider.interface';

type Amb = 'sandbox' | 'production';

interface BancoPreset {
  type: string;
  tokenUrl: (amb: Amb) => string;
  pixBaseUrl: (amb: Amb) => string;
  scope?: string;
  usaAppKey?: boolean; // Banco do Brasil: gw-dev-app-key como query param
}

/**
 * Presets dos bancos que usam a API Pix padrão do BACEN (endpoints /cob, /loc/{id}/qrcode).
 * URLs de token/base conforme a documentação de cada banco — confirme ao plugar as credenciais.
 * Todos exigem certificado de cliente (mTLS) no transporte.
 */
export const BANCO_PRESETS: Record<string, BancoPreset> = {
  BANCO_INTER: {
    type: 'BANCO_INTER',
    tokenUrl: () => 'https://cdpj.partners.bancointer.com.br/oauth/v2/token',
    pixBaseUrl: () => 'https://cdpj.partners.bancointer.com.br/pix/v2',
    scope: 'cob.write cob.read pix.read',
  },
  SICOOB: {
    type: 'SICOOB',
    tokenUrl: () => 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token',
    pixBaseUrl: (amb) =>
      amb === 'production'
        ? 'https://api.sicoob.com.br/pix/api/v2'
        : 'https://sandbox.sicoob.com.br/sicoob/sandbox/pix/api/v2',
    scope: 'cob.write cob.read pix.read',
  },
  SICREDI: {
    type: 'SICREDI',
    tokenUrl: (amb) => (amb === 'production' ? 'https://api-pix.sicredi.com.br/oauth/token' : 'https://api-pix-h.sicredi.com.br/oauth/token'),
    pixBaseUrl: (amb) => (amb === 'production' ? 'https://api-pix.sicredi.com.br/api/v2' : 'https://api-pix-h.sicredi.com.br/api/v2'),
    scope: 'cob.write cob.read',
  },
  BANCO_BRASIL: {
    type: 'BANCO_BRASIL',
    tokenUrl: (amb) => (amb === 'production' ? 'https://oauth.bb.com.br/oauth/token' : 'https://oauth.sandbox.bb.com.br/oauth/token'),
    pixBaseUrl: (amb) => (amb === 'production' ? 'https://api-pix.bb.com.br/pix/v2' : 'https://api-pix.hm.bb.com.br/pix/v2'),
    scope: 'cob.write cob.read pix.read',
    usaAppKey: true,
  },
};

/**
 * Provider genérico para bancos com API Pix (padrão BACEN): Inter, Sicoob, Sicredi, BB.
 * - Autenticação: OAuth2 client_credentials (Basic clientId:clientSecret) sobre mTLS.
 * - Cobrança: POST /cob (Pix imediato). Status: GET /cob/{txid}. Cancelar: PATCH /cob/{txid}.
 * O certificado do cliente (.p12/.pfx em base64 + senha) é obrigatório para o handshake mTLS.
 */
export class BancoPixProvider implements PaymentProvider {
  readonly type: string;
  private readonly creds: ProviderCredentials;
  private readonly preset: BancoPreset;
  private readonly amb: Amb;
  private readonly agent: https.Agent;
  private http?: AxiosInstance;
  private token?: string;

  constructor(preset: BancoPreset, creds: ProviderCredentials) {
    this.preset = preset;
    this.type = preset.type;
    this.creds = creds;
    this.amb = creds.ambiente === 'production' ? 'production' : 'sandbox';
    // Certificado de cliente (.p12/.pfx) para o mTLS. Sem ele, os bancos recusam a conexão.
    const pfx = creds.certBase64 ? Buffer.from(creds.certBase64, 'base64') : undefined;
    this.agent = new https.Agent({ pfx, passphrase: creds.certPassword });
  }

  private async auth(): Promise<AxiosInstance> {
    if (this.http && this.token) return this.http;
    if (!this.creds.clientId || !this.creds.clientSecret) throw new Error(`${this.type}: client_id/client_secret não configurados`);
    if (!this.creds.certBase64) throw new Error(`${this.type}: certificado (mTLS) não configurado`);

    const basic = Buffer.from(`${this.creds.clientId}:${this.creds.clientSecret}`).toString('base64');
    const params = new URLSearchParams({ grant_type: 'client_credentials' });
    if (this.preset.scope) params.set('scope', this.preset.scope);

    const { data } = await axios.post(this.preset.tokenUrl(this.amb), params.toString(), {
      httpsAgent: this.agent,
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000,
    });
    this.token = data.access_token;

    this.http = axios.create({
      baseURL: this.preset.pixBaseUrl(this.amb),
      httpsAgent: this.agent,
      timeout: 20000,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      // Banco do Brasil exige a app key como query param em toda chamada.
      params: this.preset.usaAppKey && this.creds.appKey ? { 'gw-dev-app-key': this.creds.appKey } : undefined,
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
    const body = {
      calendario: { expiracao: 86400 },
      devedor: doc.length > 11 ? { cnpj: doc, nome: input.customer.nome } : { cpf: doc, nome: input.customer.nome },
      valor: { original: input.valor.toFixed(2) },
      chave: this.creds.pixKey ?? '',
      solicitacaoPagador: input.descricao ?? 'Cobrança',
    };
    const { data: cob } = await http.post('/cob', body);

    let pixCopiaCola: string | undefined = cob.pixCopiaeCola;
    if (!pixCopiaCola && cob.loc?.id) {
      const { data: qr } = await http.get(`/loc/${cob.loc.id}/qrcode`);
      pixCopiaCola = qr.qrcode;
    }
    return { externalId: cob.txid, status: this.normalizeStatus(cob.status), pixCopiaCola };
  }

  async getChargeStatus(externalId: string): Promise<ChargeStatusResult> {
    const http = await this.auth();
    const { data } = await http.get(`/cob/${externalId}`);
    return {
      externalId,
      status: this.normalizeStatus(data.status),
      pagoEm: data.pix?.[0]?.horario ? new Date(data.pix[0].horario) : undefined,
    };
  }

  async cancelCharge(externalId: string): Promise<void> {
    const http = await this.auth();
    await http.patch(`/cob/${externalId}`, { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' });
  }

  parseWebhook(_headers: Record<string, string>, body: unknown): WebhookParseResult {
    // O webhook Pix dos bancos é protegido por mTLS no transporte, não por assinatura no corpo.
    // Marcamos como NÃO confiável; o controller reconfirma o status via getChargeStatus (autoritativo).
    const evt = body as { pix?: { txid?: string; horario?: string }[] };
    const pix = evt.pix?.[0];
    return {
      valid: false,
      eventType: 'pix',
      externalId: pix?.txid,
      pagoEm: pix?.horario ? new Date(pix.horario) : undefined,
      idempotencyKey: `${this.type.toLowerCase()}:pix:${pix?.txid}:${pix?.horario}`,
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
}
