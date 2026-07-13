/** Mensagem a ser enviada por um canal. */
export interface SendMessageInput {
  to: string; // telefone E.164 sem '+' (WhatsApp/SMS) ou e-mail
  text: string;
  templateName?: string; // nome do template aprovado (WhatsApp Cloud utility)
  templateParams?: string[];
}

export interface SendMessageResult {
  providerMsgId?: string;
  status: 'ENVIADO' | 'FALHA';
  erro?: string;
  custo?: number;
}

/** Credenciais decifradas de um canal. */
export interface ChannelCredentials {
  // WhatsApp Cloud
  token?: string;
  phoneId?: string;
  // Evolution / uazapi
  apiUrl?: string;
  apiKey?: string;
  instance?: string;
  // E-mail
  from?: string;
}

/**
 * Contrato único para todos os canais de mensagem.
 * WhatsApp: Cloud (oficial), Evolution, uazapi — todos plugáveis.
 * Também Email e SMS.
 */
export interface MessageChannel {
  readonly type: string;
  send(input: SendMessageInput): Promise<SendMessageResult>;
}
