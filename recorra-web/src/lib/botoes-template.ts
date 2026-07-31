/**
 * Validação do mapeamento dos botões de template (campanha e passo de régua).
 *
 * Espelha `erroMapeamentoBotoes` do backend (`modules/channels/meta-graph.ts`) para
 * o painel avisar na hora de salvar, em vez de o usuário só descobrir no relatório
 * do disparo. O backend continua sendo a barreira que vale — este é o atalho.
 */

/**
 * Tokens que rendem uma URL inteira (do ERP/gateway). Num botão de URL a Meta só
 * aceita o SUFIXO da base fixa aprovada no template, então esses tokens sempre
 * fazem a Meta recusar o envio. O certo é {{pagina}}, que rende só o token
 * assinado da página de pagamento da Recorrai.
 */
const TOKENS_URL_INTEIRA = /^\{\{\s*(link|linkpagamento|pagamento|boleto)\s*\}\}$/i;

export const ERRO_BOTAO_URL =
  'O botão de link não aceita "Link de pagamento"/"Boleto": o WhatsApp só deixa completar o final de um domínio fixo aprovado no template, e a URL do ERP é de outro domínio — a Meta recusaria o envio. Escolha "Página de pagamento (Recorrai)" no botão, ou use {{link}} no texto da mensagem.';

/** Mensagem de erro, ou null se o mapeamento está ok. */
export function erroMapeamentoBotoes(
  botoes?: { subType: 'url' | 'copy_code'; token: string }[] | null,
): string | null {
  const ruim = (botoes ?? []).some((b) => b?.subType === 'url' && TOKENS_URL_INTEIRA.test((b.token ?? '').trim()));
  return ruim ? ERRO_BOTAO_URL : null;
}
