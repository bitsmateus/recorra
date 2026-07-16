import axios, { AxiosInstance } from 'axios';
import * as nodemailer from 'nodemailer';
import {
  MessageChannel,
  SendMessageInput,
  SendMessageResult,
  ChannelCredentials,
} from '../message-channel.interface';
import { renderEmail, primeiraUrl } from '../email-layout';

/**
 * E-mail transacional. Dois modos, definidos por `emailProvider`:
 *  - 'resend' (padrão): API do Resend (resend.com/docs) — só precisa da API key.
 *  - 'smtp': servidor SMTP do próprio cliente (host/porta/usuário/senha).
 */
export class EmailChannel implements MessageChannel {
  readonly type = 'EMAIL';
  private readonly creds: ChannelCredentials;
  private readonly from: string;
  private readonly usaSmtp: boolean;
  private readonly http?: AxiosInstance;

  constructor(creds: ChannelCredentials) {
    this.creds = creds;
    this.from = creds.from ?? 'Recorrai <no-reply@recorra.com.br>';
    this.usaSmtp = creds.emailProvider === 'smtp';

    if (!this.usaSmtp) {
      this.http = axios.create({
        baseURL: 'https://api.resend.com',
        headers: { Authorization: `Bearer ${creds.apiKey ?? creds.token}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      });
    }
  }

  private assunto(input: SendMessageInput): string {
    return input.assunto?.trim() || 'Aviso de cobrança';
  }

  /** Mesmo layout que o painel mostra na prévia — ver email-layout.ts. */
  private html(input: SendMessageInput): string {
    return renderEmail(
      {
        assunto: this.assunto(input),
        texto: input.text,
        botaoUrl: primeiraUrl(input.text) ?? undefined,
      },
      this.creds.emailMarca ?? {},
    );
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    try {
      return this.usaSmtp ? await this.enviarSmtp(input) : await this.enviarResend(input);
    } catch (e) {
      return { status: 'FALHA', erro: axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e) };
    }
  }

  private async enviarResend(input: SendMessageInput): Promise<SendMessageResult> {
    const { data } = await this.http!.post('/emails', {
      from: this.from,
      to: input.to,
      subject: this.assunto(input),
      html: this.html(input),
    });
    return { providerMsgId: data?.id, status: 'ENVIADO' };
  }

  private async enviarSmtp(input: SendMessageInput): Promise<SendMessageResult> {
    const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = this.creds;
    if (!smtpHost) return { status: 'FALHA', erro: 'SMTP: servidor (host) não configurado.' };

    const porta = Number(smtpPort ?? 587);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: porta,
      // 465 = SSL implícito; 587/25 = STARTTLS.
      secure: smtpSecure ?? porta === 465,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass ?? '' } : undefined,
    });

    const info = await transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: this.assunto(input),
      html: this.html(input),
    });
    return { providerMsgId: info.messageId, status: 'ENVIADO' };
  }
}
