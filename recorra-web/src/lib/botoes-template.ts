/**
 * Validação do mapeamento dos botões de template (campanha e passo de régua).
 *
 * Espelha `erroMapeamentoBotoes` do backend (`modules/channels/meta-graph.ts`) para
 * o painel filtrar as opções e avisar na hora de salvar, em vez de o usuário só
 * descobrir no relatório do disparo. O backend continua sendo a barreira que vale.
 */

/**
 * Tokens que rendem uma URL inteira (do ERP/gateway). Num botão de URL a Meta só
 * aceita o SUFIXO da base fixa aprovada no template, então esses tokens sempre
 * fazem a Meta recusar o envio. O certo é {{pagina}}, que rende só o token
 * assinado da página de pagamento da Recorrai.
 */
const TOKENS_URL_INTEIRA = /^\{\{\s*(link|linkpagamento|pagamento|boleto)\s*\}\}$/i;

/**
 * Tokens que rendem um valor longo. O botão "Copiar código da oferta" é o cupom da
 * Meta e só carrega um código curto — o Pix copia-e-cola (200+ caracteres), um link
 * ou o token da página estouram o limite e a Meta recusa o envio (#132018).
 */
const TOKENS_LONGOS = /^\{\{\s*(pix|link|linkpagamento|pagamento|boleto|pagina)\s*\}\}$/i;

export const ERRO_BOTAO_URL =
  'O botão de link não aceita "Link de pagamento"/"Boleto": o WhatsApp só deixa completar o final de um domínio fixo aprovado no template, e a URL do ERP é de outro domínio — a Meta recusaria o envio. Escolha "Página de pagamento (Recorrai)" no botão, ou use {{link}} no texto da mensagem.';

export const ERRO_BOTAO_COPY =
  'O botão "Copiar código da oferta" é o cupom da Meta e só carrega um código curto — o Pix copia-e-cola não cabe, e a Meta recusa o envio. Para mandar o Pix: use o botão de link com "Página de pagamento (Recorrai)", que já mostra o QR Code e o botão de copiar, e/ou coloque {{pix}} no texto da mensagem. O ideal é um template sem este botão.';

type SubTipo = 'url' | 'copy_code';

/** Mensagem de erro para um botão, ou null se o mapeamento serve. */
export function erroBotao(subType: SubTipo | undefined, token: string | undefined): string | null {
  const t = (token ?? '').trim();
  if (!t) return null;
  if (subType === 'url' && TOKENS_URL_INTEIRA.test(t)) return ERRO_BOTAO_URL;
  if (subType === 'copy_code' && TOKENS_LONGOS.test(t)) return ERRO_BOTAO_COPY;
  return null;
}

/** Mensagem de erro do primeiro botão inválido, ou null se o mapeamento está ok. */
export function erroMapeamentoBotoes(botoes?: { subType: SubTipo; token: string }[] | null): string | null {
  for (const b of botoes ?? []) {
    const erro = erroBotao(b?.subType, b?.token);
    if (erro) return erro;
  }
  return null;
}

/**
 * Filtra a lista de variáveis oferecida no dropdown de um botão, escondendo o que
 * a Meta recusaria. Evita o erro em vez de só reclamar depois de escolhido.
 */
export function varsDoBotao<T>(vars: T[], subType: SubTipo, token: (v: T) => string): T[] {
  return vars.filter((v) => !erroBotao(subType, token(v)));
}
