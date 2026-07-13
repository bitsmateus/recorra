import axios, { AxiosInstance } from 'axios';
import {
  MessageChannel,
  SendMessageInput,
  SendMessageResult,
  ChannelCredentials,
} from '../message-channel.interface';

/**
 * E-mail transacional via Resend (fallback barato e para comprovantes).
 * Docs: resend.com/docs
 */
export class EmailChannel implements MessageChannel {
  readonly type = 'EMAIL';
  private readonly http: AxiosInstance;
  private readonly from: string;

  constructor(creds: ChannelCredentials) {
    this.http = axios.create({
      baseURL: 'https://api.resend.com',
      headers: { Authorization: `Bearer ${creds.apiKey ?? creds.token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    this.from = creds.from ?? 'Recorra <no-reply@recorra.com.br>';
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    try {
      const { data } = await this.http.post('/emails', {
        from: this.from,
        to: input.to,
        subject: input.templateName ?? 'Aviso de cobrança',
        html: `<p>${input.text.replace(/\n/g, '<br>')}</p>`,
      });
      return { providerMsgId: data?.id, status: 'ENVIADO' };
    } catch (e) {
      return { status: 'FALHA', erro: axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e) };
    }
  }
}
