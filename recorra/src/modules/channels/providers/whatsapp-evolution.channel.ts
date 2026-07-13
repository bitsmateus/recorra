import axios, { AxiosInstance } from 'axios';
import {
  MessageChannel,
  SendMessageInput,
  SendMessageResult,
  ChannelCredentials,
} from '../message-channel.interface';

/**
 * WhatsApp via Evolution API (self-hosted, não-oficial).
 * A instância precisa estar conectada (state: open).
 * Docs: github.com/EvolutionAPI/evolution-api
 */
export class WhatsAppEvolutionChannel implements MessageChannel {
  readonly type = 'WHATSAPP_EVOLUTION';
  private readonly http: AxiosInstance;
  private readonly instance: string;

  constructor(creds: ChannelCredentials) {
    this.http = axios.create({
      baseURL: (creds.apiUrl ?? '').replace(/\/$/, ''),
      headers: { apikey: creds.apiKey ?? '', 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    this.instance = creds.instance ?? '';
  }

  /** Garante o código do país (55) em números brasileiros sem DDI. */
  private waNumber(to: string): string {
    let d = (to || '').replace(/\D/g, '');
    if (d.length <= 11) d = '55' + d;
    return d;
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    try {
      const { data } = await this.http.post(`/message/sendText/${this.instance}`, {
        number: this.waNumber(input.to),
        text: input.text,
      });
      return { providerMsgId: data?.key?.id ?? data?.id, status: 'ENVIADO' };
    } catch (e) {
      return { status: 'FALHA', erro: axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e) };
    }
  }
}
