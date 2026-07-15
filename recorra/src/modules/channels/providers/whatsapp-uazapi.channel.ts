import axios, { AxiosInstance } from 'axios';
import { safeHttpAgents } from '@/common/net/safe-http';
import {
  MessageChannel,
  SendMessageInput,
  SendMessageResult,
  ChannelCredentials,
} from '../message-channel.interface';

/**
 * WhatsApp via uazapi (não-oficial).
 * Autenticação por token de instância no header. Ajuste o endpoint conforme
 * a versão da uazapi contratada (padrão: POST /send/text).
 */
export class WhatsAppUazapiChannel implements MessageChannel {
  readonly type = 'WHATSAPP_UAZAPI';
  private readonly http: AxiosInstance;

  constructor(creds: ChannelCredentials) {
    this.http = axios.create({
      ...safeHttpAgents(),
      baseURL: (creds.apiUrl ?? '').replace(/\/$/, ''),
      headers: { token: creds.token ?? creds.apiKey ?? '', 'Content-Type': 'application/json' },
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
      const { data } = await this.http.post('/send/text', {
        number: this.waNumber(input.to),
        text: input.text,
      });
      return { providerMsgId: data?.id ?? data?.messageid, status: 'ENVIADO' };
    } catch (e) {
      return { status: 'FALHA', erro: axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e) };
    }
  }
}
