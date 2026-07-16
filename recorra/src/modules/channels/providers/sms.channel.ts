import axios, { AxiosInstance } from 'axios';
import {
  MessageChannel,
  SendMessageInput,
  SendMessageResult,
  ChannelCredentials,
} from '../message-channel.interface';

/**
 * SMS via Zenvia (fallback quando o WhatsApp não entrega).
 * Docs: zenvia.github.io / developers.zenvia.com
 * `apiKey` = X-API-TOKEN da Zenvia; `from` = remetente/serviço.
 */
export class SmsChannel implements MessageChannel {
  readonly type = 'SMS';
  private readonly http: AxiosInstance;
  private readonly from: string;

  constructor(creds: ChannelCredentials) {
    this.http = axios.create({
      baseURL: creds.apiUrl?.replace(/\/$/, '') || 'https://api.zenvia.com',
      headers: { 'X-API-TOKEN': creds.apiKey ?? creds.token ?? '', 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    this.from = creds.from ?? 'Recorrai';
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    try {
      const { data } = await this.http.post('/v2/channels/sms/messages', {
        from: this.from,
        to: input.to,
        contents: [{ type: 'text', text: input.text }],
      });
      return { providerMsgId: data?.id, status: 'ENVIADO' };
    } catch (e) {
      return {
        status: 'FALHA',
        erro: axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e),
      };
    }
  }
}
