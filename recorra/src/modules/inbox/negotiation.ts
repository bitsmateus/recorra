/**
 * Motor de negociação por WhatsApp (chatbot) — lógica pura e testável.
 * Detecta a intenção da resposta do cliente e sugere uma resposta/ação.
 * A Fase 3 (LLM) pode substituir a detecção mantendo a mesma interface.
 */

export type Intent =
  | 'PAGAR' // quer pagar agora
  | 'SEGUNDA_VIA' // quer o Pix/boleto de novo
  | 'NEGOCIAR' // quer parcelar / desconto
  | 'PRAZO' // pede mais prazo / data
  | 'CONTESTAR' // não reconhece a dívida
  | 'PARAR' // não perturbe / descadastro
  | 'SAUDACAO'
  | 'DESCONHECIDO';

export interface NegotiationContext {
  nome?: string;
  temVencida?: boolean;
  valor?: string; // já formatado (R$)
  pix?: string;
  permiteAcordo?: boolean;
  descontoMax?: number; // %
}

export interface BotAction {
  intent: Intent;
  reply: string;
  // ações que o backend deve executar
  enviarPix?: boolean;
  abrirAcordo?: boolean;
  registrarOptOut?: boolean;
  marcarContestada?: boolean;
  encaminharHumano?: boolean;
}

const has = (t: string, arr: string[]) => arr.some((k) => t.includes(k));

/** Detecta a intenção a partir do texto livre do cliente. */
export function detectIntent(texto: string): Intent {
  const t = (texto ?? '').toLowerCase().trim();
  if (!t) return 'DESCONHECIDO';
  if (has(t, ['não perturbe', 'nao perturbe', 'parar', 'descadastr', 'sair', 'me tira', 'não quero receber', 'nao quero receber', 'stop'])) return 'PARAR';
  if (has(t, ['não reconheço', 'nao reconheco', 'não devo', 'nao devo', 'não é minha', 'nao e minha', 'indevid', 'contest', 'já paguei', 'ja paguei'])) return 'CONTESTAR';
  if (has(t, ['parcel', 'desconto', 'negoci', 'acordo', 'dividir', 'à vista', 'a vista'])) return 'NEGOCIAR';
  if (has(t, ['prazo', 'dia ', 'semana que vem', 'próxima semana', 'proxima semana', 'depois do dia', 'consigo pagar dia', 'só consigo', 'so consigo'])) return 'PRAZO';
  if (has(t, ['segunda via', '2 via', '2ª via', 'manda o pix', 'manda o codigo', 'manda o código', 'reenvia', 'copia e cola', 'qr'])) return 'SEGUNDA_VIA';
  if (has(t, ['pagar', 'quitar', 'pago', 'vou pagar', 'quero pagar', 'como pago', 'me manda pra pagar'])) return 'PAGAR';
  if (has(t, ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'])) return 'SAUDACAO';
  return 'DESCONHECIDO';
}

/** Monta a resposta do bot e as ações a executar, conforme a intenção e o contexto. */
export function buildBotReply(texto: string, ctx: NegotiationContext = {}): BotAction {
  const intent = detectIntent(texto);
  const nome = ctx.nome ? `, ${ctx.nome}` : '';

  switch (intent) {
    case 'PAGAR':
    case 'SEGUNDA_VIA':
      return {
        intent,
        reply: ctx.pix
          ? `Perfeito${nome}! Aqui está o Pix copia-e-cola da sua fatura${ctx.valor ? ` de ${ctx.valor}` : ''}:`
          : `Certo${nome}! Já te envio o código de pagamento.`,
        enviarPix: true,
      };
    case 'NEGOCIAR':
      return ctx.permiteAcordo
        ? {
            intent,
            reply: `Consigo te ajudar${nome}! Podemos dividir${ctx.descontoMax ? ` e aplicar até ${ctx.descontoMax}% de desconto à vista` : ''}. Em quantas vezes fica melhor pra você?`,
            abrirAcordo: true,
          }
        : { intent, reply: `Entendi${nome}. Vou encaminhar sua solicitação de negociação para nossa equipe.`, encaminharHumano: true };
    case 'PRAZO':
      return { intent, reply: `Sem problema${nome}. Me diga a data que consegue pagar que eu registro e te reenvio o Pix próximo do prazo.`, encaminharHumano: true };
    case 'CONTESTAR':
      return { intent, reply: `Obrigado por avisar${nome}. Registrei a contestação e pausei as cobranças desta fatura enquanto verificamos.`, marcarContestada: true, encaminharHumano: true };
    case 'PARAR':
      return { intent, reply: `Tudo bem${nome}, não enviaremos mais mensagens por aqui. Você foi descadastrado deste canal.`, registrarOptOut: true };
    case 'SAUDACAO':
      return { intent, reply: `Olá${nome}! Posso te ajudar com sua fatura${ctx.temVencida ? ' em aberto' : ''}? Você pode pagar, pedir a segunda via ou negociar.` };
    default:
      return { intent, reply: `Recebi sua mensagem${nome}. Posso te ajudar a pagar, enviar a segunda via ou negociar sua fatura. É só me dizer.`, encaminharHumano: true };
  }
}
