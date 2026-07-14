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
  // HTTP genérico (API aberta) — ver HttpGenericChannel
  httpUrl?: string; // endpoint completo (ex.: https://api.nxdigital.com.br/v1/messages)
  httpMethod?: string; // POST (padrão) | PUT | GET
  httpHeaders?: Record<string, string>; // valores podem conter {{token}}
  httpBodyTemplate?: string; // JSON com {{to}} {{text}} {{templateName}} {{templateParams}}
  httpMsgIdPath?: string; // caminho para o ID na resposta (ex.: "data.id")
  httpToFormat?: string; // 'digits' (padrão, ex.: 5511...) | 'e164' (+55...) | 'raw'
  // NX Systems (central de atendimento) — ver NxSystemsChannel
  nxBaseUrl?: string; // ex.: https://webapi.nxsystems.com.br/v2/api/external/{ApiID}
  nxToken?: string; // Bearer token
  nxOficial?: boolean; // true = API oficial (WABA, só template) | false = não oficial (Evolution, texto livre)
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
