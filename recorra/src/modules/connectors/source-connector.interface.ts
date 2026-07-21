/** Cliente normalizado vindo de um sistema de origem (ERP). */
export interface SourceCustomer {
  externalId: string;
  nome: string;
  doc: string; // CPF/CNPJ
  email?: string;
  telefone?: string;
  contrato?: string;
}

/** Fatura normalizada vinda de um sistema de origem, já com dados de pagamento. */
export interface SourceInvoice {
  externalId: string;
  customerExternalId: string;
  valor: number;
  vencimento: Date;
  status: string; // PENDENTE | VENCIDA | PAGA
  pixCopiaCola?: string;
  boletoLinha?: string;
  boletoUrl?: string;
}

export interface SourceCredentials {
  urlBase: string;
  token: string;
  extra?: Record<string, string>;
}

/**
 * Contrato único para todos os sistemas de origem (IXC, SGP, HubSoft, Voalle, MK-Auth, CSV, API).
 * O motor de sincronização usa esta interface — adicionar um ERP = implementar um conector.
 */
export interface SourceConnector {
  readonly system: string;

  /**
   * True só quando `fetchOpenInvoices` garante devolver **todas** as faturas em
   * aberto (paginação completa). É o que autoriza a conciliação por ausência —
   * marcar como paga a fatura que sumiu da lista. Se o conector faz uma chamada
   * única e o ERP pode limitar/paginar o retorno por conta própria, deixe `false`:
   * a fatura poderia ficar de fora do lote e ser quitada por engano.
   */
  readonly snapshotCompleto: boolean;

  testConnection(): Promise<boolean>;
  fetchCustomers(sinceCursor?: string): Promise<SourceCustomer[]>;
  fetchOpenInvoices(sinceCursor?: string): Promise<SourceInvoice[]>;
}
