import axios, { AxiosInstance } from 'axios';
import { safeHttpAgents } from '@/common/net/safe-http';
import { randomUUID } from 'node:crypto';
import {
  MessageChannel,
  SendMessageInput,
  SendMessageResult,
  ChannelCredentials,
} from '../message-channel.interface';
import { botoesComponents } from '../meta-graph';

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
      ...safeHttpAgents(),
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

  /**
   * Traduz o erro cru da NX/WABA num texto acionável. A NX devolve códigos
   * genéricos (ex.: ERR_SEND_TEMPLATE) que sozinhos não dizem o que corrigir.
   */
  private explicarErro(e: unknown, ctx: { templateName?: string; nParams: number; idioma: string }): string {
    if (!axios.isAxiosError(e)) return String(e);
    const data = e.response?.data as Record<string, any> | undefined;
    const codigo = String(data?.error ?? data?.message ?? '').trim();
    const cru = data ? JSON.stringify(data) : e.message;

    if (/ERR_SEND_TEMPLATE|template/i.test(codigo)) {
      return (
        `A NX/WhatsApp recusou o template "${ctx.templateName ?? '?'}" (idioma ${ctx.idioma}, ${ctx.nParams} variável(is)). ` +
        'Causas comuns: (1) o nº de variáveis enviado difere do template aprovado — sincronize os templates em Canais e confira; ' +
        '(2) o idioma não é o mesmo do template aprovado; (3) o template não está aprovado nesta conta WABA; ' +
        `(4) o template tem cabeçalho/botão que exige parâmetro. Detalhe da NX: ${cru}`
      );
    }
    if (/ERR_.*NUMBER|invalid.*number|phone/i.test(codigo)) {
      return `A NX não aceitou o número de destino. Confira DDI/DDD e se o WhatsApp existe. Detalhe: ${cru}`;
    }
    if (e.response?.status === 401 || e.response?.status === 403) {
      return `A NX recusou a autenticação (token). Reconecte o canal em Canais. Detalhe: ${cru}`;
    }
    return cru;
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const number = this.waNumber(input.to);
    const idioma = input.templateLanguage || 'pt_BR';
    const params = input.templateParams ?? [];
    try {
      // ----- Template WABA -----
      if (input.templateName) {
        const botoes = botoesComponents(input.templateButtons);
        const components = [
          ...(params.length ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: t })) }] : []),
          ...botoes,
        ];
        const templateData: Record<string, unknown> = {
          messaging_product: 'whatsapp',
          to: number,
          type: 'template',
          template: {
            name: input.templateName,
            language: { code: idioma },
            ...(components.length ? { components } : {}),
          },
        };
        // /templateBody aceita components; /template é o atalho sem parâmetros.
        const path = components.length ? '/templateBody' : '/template';
        const { data } = await this.http.post(path, { number, isClosed: true, templateData });
        // A NX responde HTTP 200 mesmo quando falha, sinalizando no corpo (success:false).
        if (data && data.success === false) {
          throw Object.assign(new Error('NX success:false'), { isAxiosError: true, response: { data, status: 200 } });
        }
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
      return { status: 'FALHA', erro: this.explicarErro(e, { templateName: input.templateName, nParams: params.length, idioma }) };
    }
  }
}
