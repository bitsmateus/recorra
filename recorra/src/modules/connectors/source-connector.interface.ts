/**
 * Regra de vencimento alinhada ao resto do sistema: uma fatura que vence HOJE
 * ainda é pendente — só conta como vencida a partir do dia seguinte. Compara por
 * dia (borda UTC), não pelo instante atual. Data inválida → não classifica como
 * vencida (evita marcar tudo por um campo faltante do ERP).
 */
export function venceuAntesDeHoje(vencimento: Date): boolean {
  if (Number.isNaN(vencimento.getTime())) return false;
  const h = new Date();
  const hojeUtc = Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate());
  const vUtc = Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), vencimento.getUTCDate());
  return vUtc < hojeUtc;
}

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
   * True só quando o último `fetchOpenInvoices` comprovadamente devolveu **todas**
   * as faturas em aberto (paginação completa). É o que autoriza a conciliação por
   * ausência — marcar como paga a fatura que sumiu da lista. Se o conector faz uma
   * chamada única e o ERP pode limitar/paginar o retorno por conta própria, fica
   * `false`: a fatura poderia estar fora do lote e ser quitada por engano.
   *
   * Alguns conectores decidem isso em tempo de execução (paginam e só marcam
   * `true` se chegaram ao fim), então NÃO é `readonly` no contrato — o motor de
   * sync lê o valor logo após o fetch.
   */
  snapshotCompleto: boolean;

  testConnection(): Promise<boolean>;
  fetchCustomers(sinceCursor?: string): Promise<SourceCustomer[]>;
  fetchOpenInvoices(sinceCursor?: string): Promise<SourceInvoice[]>;
}
