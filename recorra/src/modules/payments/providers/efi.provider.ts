import axios, { AxiosInstance } from 'axios';
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

  async testConnection(): Promise<boolean> {
    // Obter o token OAuth2 já valida client_id/client_secret.
    const token = await this.auth();
    return !!token;
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

  /** Lista as cobranças Pix (/v2/cob) do último ano, paginando. Requer OAuth2 (auth). */
  private async buscarCobs(): Promise<any[]> {
    await this.auth();
    const fim = new Date();
    const inicio = new Date(fim.getTime() - 365 * 86400000);
    const out: any[] = [];
    let pagina = 0;
    for (let i = 0; i < 200; i++) {
      const { data } = await this.http.get('/v2/cob', {
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
      await this.auth();
      const { data } = await this.http.get(`/v2/cob/${externalId}`);
      if (!data?.txid) return null;
      return this.mapCob(data);
    } catch {
      return null;
    }
  }
}
