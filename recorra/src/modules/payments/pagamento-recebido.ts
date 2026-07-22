/**
 * Preferência da mensagem automática de "pagamento recebido".
 * Fica em `Tenant.config.pagamentoRecebido` (mesmo padrão de Tenant.config.emailMarca).
 */
export interface PagamentoRecebidoPref {
  /** Liga/desliga o envio da confirmação ao cliente. */
  ativo: boolean;
  /** Canal a usar. Vazio = primeira conta de canal ativa do tenant. */
  canal: string;
  /** Nome do template HSM — obrigatório nos canais WhatsApp. */
  templateName: string;
  /** Valor de cada {{1}}, {{2}}... do template HSM. Aceita as mesmas variáveis do texto. */
  templateParams: string[];
  /** Assunto (só e-mail). */
  assunto: string;
  /** Texto. Aceita {{nome}}, {{valor}} e {{vencimento}}. */
  conteudo: string;
}

/**
 * Desligado por padrão: quem contrata a régua decide se quer também avisar o
 * pagamento — ligar sozinho mandaria mensagem em nome do cliente sem ele pedir.
 */
export const PAGAMENTO_RECEBIDO_PADRAO: PagamentoRecebidoPref = {
  ativo: false,
  canal: '',
  templateName: '',
  templateParams: [],
  assunto: 'Recebemos seu pagamento',
  conteudo: 'Recebemos seu pagamento, {{nome}}! Obrigado 🙌 Sua fatura de {{valor}} está quitada.',
};

/** Lê a preferência de um `Tenant.config` cru, aplicando os padrões. */
export function lerPagamentoRecebido(config: unknown): PagamentoRecebidoPref {
  const cfg = (config ?? {}) as { pagamentoRecebido?: Partial<PagamentoRecebidoPref> };
  return { ...PAGAMENTO_RECEBIDO_PADRAO, ...(cfg.pagamentoRecebido ?? {}) };
}
