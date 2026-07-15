import axios, { AxiosInstance } from 'axios';
import {
  MessageChannel,
  SendMessageInput,
  SendMessageResult,
  ChannelCredentials,
} from '../message-channel.interface';

/**
 * WhatsApp Cloud API (oficial da Meta).
 * Para cobrança, use templates categoria "utility" (muito mais baratos).
 * Se o cliente respondeu nas últimas 24h, pode-se enviar texto livre (grátis).
 * Docs: developers.facebook.com/docs/whatsapp/cloud-api
 */
export class WhatsAppCloudChannel implements MessageChannel {
  readonly type = 'WHATSAPP_CLOUD';
  private readonly http: AxiosInstance;

  constructor(creds: ChannelCredentials) {
    this.http = axios.create({
      baseURL: `https://graph.facebook.com/v20.0/${creds.phoneId}`,
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
  }

  private waNumber(to: string): string {
    let d = (to || '').replace(/\D/g, '');
    if (d.length <= 11) d = '55' + d;
    return d;
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    try {
      // Template (utility) quando informado; senão texto livre (janela de 24h).
      const body = input.templateName
        ? {
            messaging_product: 'whatsapp',
            to: this.waNumber(input.to),
            type: 'template',
            template: {
              name: input.templateName,
              language: { code: input.templateLanguage || 'pt_BR' },
              components: input.templateParams?.length
                ? [{ type: 'body', parameters: input.templateParams.map((t) => ({ type: 'text', text: t })) }]
                : undefined,
            },
          }
        : {
            messaging_product: 'whatsapp',
            to: this.waNumber(input.to),
            type: 'text',
            text: { body: input.text },
          };

      const { data } = await this.http.post('/messages', body);
      return { providerMsgId: data.messages?.[0]?.id, status: 'ENVIADO' };
    } catch (e) {
      return { status: 'FALHA', erro: this.errMsg(e) };
    }
  }

  private errMsg(e: unknown): string {
    if (axios.isAxiosError(e)) return JSON.stringify(e.response?.data ?? e.message);
    return String(e);
  }
}
