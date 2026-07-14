import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import {
  MessageChannel,
  SendMessageInput,
  SendMessageResult,
  ChannelCredentials,
} from '../message-channel.interface';

/**
 * Integração nativa com a NX Systems (central de atendimento).
 *
 * Base: {nxBaseUrl}  (ex.: https://webapi.nxsystems.com.br/v2/api/external/{ApiID})
 * Auth: Authorization: Bearer {nxToken}
 *
 * Dois modos, definidos por `nxOficial`:
 *   - NÃO oficial (Evolution) → envia texto livre (POST /) e também template.
 *   - Oficial (WABA)          → SÓ template (texto livre não é entregue, então bloqueamos).
 *
 * O ticket é sempre criado/atualizado como fechado (isClosed: true).
 * Docs (endpoints): POST /  |  POST /template  |  POST /templateBody
 */
export class NxSystemsChannel implements MessageChannel {
  readonly type = 'NX_SYSTEMS';
  private readonly http: AxiosInstance;
  private readonly oficial: boolean;

  constructor(creds: ChannelCredentials) {
    this.oficial = creds.nxOficial === true;
    this.http = axios.create({
      baseURL: (creds.nxBaseUrl ?? '').replace(/\/$/, ''),
      headers: { Authorization: `Bearer ${creds.nxToken ?? ''}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
  }

  /** Telefone em dígitos com DDI (ex.: 5511999999999). */
  private waNumber(to: string): string {
    let d = (to || '').replace(/\D/g, '');
    if (d.length <= 11) d = '55' + d;
    return d;
  }

  /** ID do atendimento retornado pela NX. */
  private ticketId(data: unknown): string | undefined {
    const d = (data ?? {}) as Record<string, any>;
    const v = d.ticketId ?? d.ticket?.id ?? d.id ?? d.data?.ticketId ?? d.data?.id;
    return v == null ? undefined : String(v);
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const number = this.waNumber(input.to);
    try {
      // ----- Template WABA -----
      if (input.templateName) {
        const params = input.templateParams ?? [];
        const templateData: Record<string, unknown> = {
          messaging_product: 'whatsapp',
          to: number,
          type: 'template',
          template: {
            name: input.templateName,
            language: { code: 'pt_BR' },
            ...(params.length
              ? { components: [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: t })) }] }
              : {}),
          },
        };
        const path = params.length ? '/templateBody' : '/template';
        const { data } = await this.http.post(path, { number, isClosed: true, templateData });
        return { providerMsgId: this.ticketId(data), status: 'ENVIADO' };
      }

      // ----- Texto livre -----
      if (this.oficial) {
        return { status: 'FALHA', erro: 'API oficial (WABA) da NX exige template — texto livre não é entregue fora da janela.' };
      }
      const { data } = await this.http.post('/', {
        body: input.text,
        number,
        externalKey: `recorra-${randomUUID()}`,
        isClosed: true,
      });
      return { providerMsgId: this.ticketId(data), status: 'ENVIADO' };
    } catch (e) {
      return { status: 'FALHA', erro: axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e) };
    }
  }
}
