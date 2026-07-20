import { ChargeMethod } from '@prisma/client';

export interface SplitRuleInput {
  destino: string;
  percentual?: number;
  valorFixo?: number;
}

export interface CreateChargeInput {
  customer: {
    nome: string;
    doc: string;
    email?: string;
    telefone?: string;
  };
  valor: number;
  vencimento: Date;
  metodo: ChargeMethod;
  descricao?: string;
  externalRef?: string;
  splits?: SplitRuleInput[];
}

export interface CreateChargeResult {
  externalId: string;
  status: string;
  pixCopiaCola?: string;
  boletoLinha?: string;
  boletoUrl?: string;
  linkPagamento?: string;
}

export interface ChargeStatusResult {
  externalId: string;
  status: string;
  pagoEm?: Date;
}

export interface WebhookParseResult {
  valid: boolean;
  eventType: string;
  externalId?: string;
  status?: string;
  pagoEm?: Date;
  idempotencyKey: string;
}


export interface ImportedCustomer {
  externalId: string;
  nome: string;
  doc: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  uf?: string;
}
export interface ImportedPayment {
  externalId: string;
  customerExternalId: string;
  valor: number;
  vencimento: Date;
  status: string;
  metodo: ChargeMethod;
  descricao?: string;
  pixCopiaCola?: string;
  linkPagamento?: string;
  boletoUrl?: string;
  pagoEm?: Date;
}

export interface PaymentProvider {
  readonly type: string;
  /** Valida as credenciais fazendo uma chamada leve autenticada. */
  testConnection?(): Promise<boolean>;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  getChargeStatus(externalId: string): Promise<ChargeStatusResult>;
  cancelCharge(externalId: string): Promise<void>;
  getPixCopiaCola?(externalId: string): Promise<string | null>;
  parseWebhook(headers: Record<string, string>, body: unknown, rawBody?: string): WebhookParseResult;
  supportsImport?(): boolean;
  listCustomers?(): Promise<ImportedCustomer[]>;
  listPayments?(): Promise<ImportedPayment[]>;
}

export interface ProviderCredentials {
  apiKey: string;
  webhookToken?: string;
  ambiente?: 'sandbox' | 'production';
  // Bancos com API Pix (padrão BACEN) via mTLS + OAuth2 client_credentials.
  clientId?: string;
  clientSecret?: string;
  certBase64?: string; // certificado do cliente (.p12/.pfx ou .pem) em base64
  certPassword?: string; // senha do .p12/.pfx (se houver)
  pixKey?: string; // chave Pix recebedora
  appKey?: string; // Banco do Brasil: gw-dev-app-key
}
