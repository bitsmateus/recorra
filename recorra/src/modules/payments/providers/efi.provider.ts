import axios, { AxiosInstance } from 'axios';
import {
  PaymentProvider,
  CreateChargeInput,
  CreateChargeResult,
  ChargeStatusResult,
  WebhookParseResult,
  ProviderCredentials,
} from '../payment-provider.interface';

/**
 * Gateway Efí (Gerencianet).
 * Pix via API (OAuth2 client_credentials). Docs: dev.efipay.com.br
 * Observação: o Pix da Efí exige certificado mTLS em produção — configure o
 * agente HTTPS com o .p12 do cliente. Aqui o fluxo lógico está pronto; ajuste
 * o transporte (certificado) conforme o ambiente.
 */
export class EfiProvider implements PaymentProvider {
  readonly type = 'EFI';
  private readonly http: AxiosInstance;
  private readonly creds: ProviderCredentials;
  private token?: string;

  constructor(creds: ProviderCredentials) {
    this.creds = creds;
    const baseURL = creds.ambiente === 'production' ? 'https://pix.api.efipay.com.br' : 'https://pix-h.api.efipay.com.br';
    this.http = axios.create({ baseURL, timeout: 20000 });
  }

  private async auth(): Promise<string> {
    if (this.token) return this.token;
    // clientId:clientSecret separados por ':' na apiKey (ex.: "Client_Id:Client_Secret")
    const [clientId, clientSecret] = this.creds.apiKey.split(':');
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const { data } = await this.http.post(
      '/oauth/token',
      { grant_type: 'client_credentials' },
      { headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' } },
    );
    this.token = data.access_token;
    this.http.defaults.headers.common.Authorization = `Bearer ${this.token}`;
    return this.token!;
  }

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    await this.auth();
    // cobrança imediata Pix
    const { data: cob } = await this.http.post('/v2/cob', {
      calendario: { expiracao: 86400 },
      devedor: input.customer.doc.length > 11
        ? { cnpj: input.customer.doc, nome: input.customer.nome }
        : { cpf: input.customer.doc, nome: input.customer.nome },
      valor: { original: input.valor.toFixed(2) },
      chave: this.creds.webhookToken ?? '', // chave Pix recebedora (reaproveitada do campo)
      solicitacaoPagador: input.descricao ?? 'Cobrança',
    });

    let pixCopiaCola: string | undefined = cob.pixCopiaeCola;
    // se não veio, gera o QR pela location
    if (!pixCopiaCola && cob.loc?.id) {
      const { data: qr } = await this.http.get(`/v2/loc/${cob.loc.id}/qrcode`);
      pixCopiaCola = qr.qrcode;
    }

    return {
      externalId: cob.txid,
      status: this.normalizeStatus(cob.status),
      pixCopiaCola,
    };
  }

  async getChargeStatus(externalId: string): Promise<ChargeStatusResult> {
    await this.auth();
    const { data } = await this.http.get(`/v2/cob/${externalId}`);
    return {
      externalId,
      status: this.normalizeStatus(data.status),
      pagoEm: data.pix?.[0]?.horario ? new Date(data.pix[0].horario) : undefined,
    };
  }

  async cancelCharge(externalId: string): Promise<void> {
    await this.auth();
    await this.http.patch(`/v2/cob/${externalId}`, { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' });
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
}
