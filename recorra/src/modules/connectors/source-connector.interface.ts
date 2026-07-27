/**
 * Regra de vencimento alinhada ao resto do sistema: uma fatura que vence HOJE
 * ainda é pendente — só conta como vencida a partir do dia seguinte. Compara por
 * dia (borda UTC), não pelo instante atual. Data inválida → não classifica como
 * vencida (evita marcar tudo por um campo faltante do ERP).
 */
/**
 * Vencimento efetivo com carência de fim de semana: boleto/Pix que vence em sábado
 * ou domingo pode ser pago no próximo dia útil, então "empurra" para a segunda. Não
 * cobre feriados (exigiria um calendário nacional/municipal). É o mesmo que o Asaas
 * faz: a cobrança fica "aguardando" até o dia útil, não "vencida".
 */
function vencimentoEfetivoUtc(vencimento: Date): number {
  const dt = new Date(Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), vencimento.getUTCDate()));
  const dow = dt.getUTCDay(); // 0=domingo, 6=sábado
  if (dow === 6) dt.setUTCDate(dt.getUTCDate() + 2);
  else if (dow === 0) dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.getTime();
}

export function venceuAntesDeHoje(vencimento: Date, hoje: Date = new Date()): boolean {
  if (Number.isNaN(vencimento.getTime())) return false;
  const hojeUtc = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return vencimentoEfetivoUtc(vencimento) < hojeUtc;
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

/** Dados de pagamento de um título vindos do ERP. */
export interface SourcePayment {
  pixCopiaCola?: string;
  boletoLinha?: string;
  boletoUrl?: string;
  linkPagamento?: string;
}

/** Fatura normalizada vinda de um sistema de origem, já com dados de pagamento. */
export interface SourceInvoice extends SourcePayment {
  externalId: string;
  customerExternalId: string;
  valor: number;
  vencimento: Date;
  status: string; // PENDENTE | VENCIDA | PAGA
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

  /**
   * Busca (gera) o Pix/boleto de UM título sob demanda — como clicar em "Imprimir
   * Pix"/"Gerar" no ERP. Opcional: nem todo sistema expõe 2ª via por título.
   * Usado no envio, quando a cobrança do ERP ainda não tem Pix/link gravado.
   */
  fetchInvoicePayment?(sourceExternalId: string): Promise<SourcePayment | null>;
}
