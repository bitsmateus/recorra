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
  /** Assunto (só e-mail). */
  assunto: string;
  /** Texto. Aceita {{nome}}, {{valor}} e {{vencimento}}. */
  conteudo: string;
}

export const PAGAMENTO_RECEBIDO_PADRAO: PagamentoRecebidoPref = {
  ativo: true,
  canal: '',
  templateName: '',
  assunto: 'Recebemos seu pagamento',
  conteudo: 'Recebemos seu pagamento, {{nome}}! Obrigado 🙌 Sua fatura de {{valor}} está quitada.',
};

/** Lê a preferência de um `Tenant.config` cru, aplicando os padrões. */
export function lerPagamentoRecebido(config: unknown): PagamentoRecebidoPref {
  const cfg = (config ?? {}) as { pagamentoRecebido?: Partial<PagamentoRecebidoPref> };
  return { ...PAGAMENTO_RECEBIDO_PADRAO, ...(cfg.pagamentoRecebido ?? {}) };
}
