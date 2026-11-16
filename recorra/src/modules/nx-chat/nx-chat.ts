/**
 * Webhook de mensagens do chat NX — parte pura e testável.
 *
 * O NX (central de atendimento) avisa cada mensagem de um atendimento. Dois usos:
 *  - Item 6: o CLIENTE respondeu → transferir o atendimento para a fila da
 *    operadora responsável (ou da equipe/carteira dele) no NX.
 *  - Item 7: a ATENDENTE escreveu no chat → registrar como contato manual dela
 *    no Recorrai (entra no relatório de recuperação).
 *
 * Formato do payload (o mesmo que o NX manda para o n8n): `{ content, contact,
 * ticket, msg, type|method }`, às vezes embrulhado em `body`. Os campos variam
 * por versão/tipo de canal, então a leitura é tolerante (vários candidatos).
 */
import { normalizeWhatsappBR, onlyDigits } from '@/common/util/normalize';

export type TipoMensagemNx = 'cliente' | 'atendente' | 'ignorar';

export interface MensagemNx {
  tipo: TipoMensagemNx;
  motivo?: string; // por que foi ignorada (diagnóstico)
  telefone?: string; // 55 + DDD + número, com o 9º dígito
  texto?: string;
  ticketId?: string;
  ticketUserId?: number | null; // atendente dono do ticket (null = sem atendente)
  ticketQueueId?: number | null;
  atendenteNome?: string | null;
  atendenteEmail?: string | null;
  messageId?: string | null;
  externalKey?: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const str = (v: any): string | null => (v === undefined || v === null || v === '' ? null : String(v));

export function lerMensagemNx(raw: any): MensagemNx {
  const body = raw?.body && typeof raw.body === 'object' && !Array.isArray(raw.body) ? raw.body : raw ?? {};
  const content = body.content ?? {};
  const contact = body.contact ?? {};
  const ticket = body.ticket ?? {};
  const msg = body.msg ?? {};

  const ehMensagem = body.type === 'message_n8n' || body.method === 'message' || !!body.content || !!body.msg;
  if (!ehMensagem) return { tipo: 'ignorar', motivo: 'evento sem mensagem' };

  // Grupo nunca é cliente de cobrança.
  const jid = String(msg.remoteJid ?? msg.key?.remoteJid ?? msg.chatid ?? '');
  if (jid.endsWith('@g.us') || ticket.isGroup === true || contact.isGroup === true) {
    return { tipo: 'ignorar', motivo: 'grupo' };
  }

  let fone = contact.number ?? ticket.contact?.number ?? msg.chatid ?? msg.from ?? msg.key?.sender_pn ?? msg.remoteJid ?? msg.key?.remoteJid ?? '';
  fone = String(fone).replace(/@.*$/, '');
  const telefone = onlyDigits(fone) ? normalizeWhatsappBR(fone) ?? onlyDigits(fone) : undefined;
  if (!telefone) return { tipo: 'ignorar', motivo: 'sem telefone' };

  const ticketId = str(ticket.id ?? msg.ticketId ?? content.ticketId);
  if (!ticketId) return { tipo: 'ignorar', motivo: 'sem ticket' };

  const texto = String(
    content.text ?? content.caption ?? content.body ?? msg.content?.text ?? msg.content?.caption
      ?? (typeof msg.text === 'string' ? msg.text : msg.text?.text ?? msg.text?.body)
      ?? (typeof msg.body === 'string' ? msg.body : '') ?? '',
  ).trim();

  const fromMe = content.fromMe === true || msg.fromMe === true || msg.key?.fromMe === true
    || (content.fromMe === undefined && msg.fromMe === undefined && ticket.fromMe === true);
  const base: MensagemNx = {
    tipo: fromMe ? 'atendente' : 'cliente',
    telefone,
    texto,
    ticketId,
    ticketUserId: num(ticket.userId ?? ticket.user?.id),
    ticketQueueId: num(ticket.queueId ?? ticket.queue?.id),
    atendenteNome: str(ticket.user?.name ?? content.userName ?? msg.userName),
    atendenteEmail: str(ticket.user?.email),
    messageId: str(content.messageId ?? msg.key?.id ?? msg.id ?? msg.messageId),
    externalKey: str(content.externalKey ?? msg.externalKey ?? body.externalKey),
  };
  // Mensagem da empresa sem atendente humano no ticket = bot/IA ou API (régua do
  // próprio Recorrai). Não é contato manual de ninguém.
  if (fromMe && !base.ticketUserId) return { ...base, tipo: 'ignorar', motivo: 'enviada por bot/API (sem atendente no ticket)' };
  if (fromMe && base.externalKey?.startsWith('recorra-')) return { ...base, tipo: 'ignorar', motivo: 'enviada pelo Recorrai' };
  return base;
}

/**
 * Para qual fila do NX o atendimento deve ir quando o cliente responde.
 * Ordem: fila pessoal da responsável (se ela é da carteira atual do cliente, ou
 * se o cliente não está em carteira nenhuma) → fila da carteira → nenhuma.
 */
export function filaDestino(e: {
  carteira: { id: string; nxQueueId: number | null } | null;
  responsavel: { id: string; carteiraId: string | null; nxQueueId: number | null; ativo: boolean } | null;
}): { queueId: number; motivo: 'responsavel' | 'carteira' } | null {
  const r = e.responsavel;
  const daCarteira = !!r && r.ativo && (!e.carteira || r.carteiraId === e.carteira.id);
  if (r && daCarteira && r.nxQueueId) return { queueId: r.nxQueueId, motivo: 'responsavel' };
  if (e.carteira?.nxQueueId) return { queueId: e.carteira.nxQueueId, motivo: 'carteira' };
  return null;
}

/** Variações do telefone para achar o cliente (com e sem o 9º dígito). */
export function variacoesTelefone(telefone: string): string[] {
  const d = onlyDigits(telefone);
  const out = new Set<string>([d]);
  if (d.startsWith('55') && d.length === 13 && d[4] === '9') out.add(d.slice(0, 4) + d.slice(5)); // sem o 9
  if (d.startsWith('55') && d.length === 12) out.add(d.slice(0, 4) + '9' + d.slice(4)); // com o 9
  return [...out];
}
