import axios, { AxiosInstance, Method } from 'axios';
import { safeHttpAgents } from '@/common/net/safe-http';
import {
  MessageChannel,
  SendMessageInput,
  SendMessageResult,
  ChannelCredentials,
} from '../message-channel.interface';

/**
 * Canal HTTP genérico ("API aberta").
 *
 * Permite enviar mensagens por QUALQUER sistema que exponha um endpoint HTTP
 * (ex.: central de atendimento da NX Digital com canal de API oficial), sem
 * precisar de código específico. O tenant configura:
 *   - httpUrl:          endpoint completo
 *   - httpMethod:       POST (padrão) | PUT | GET
 *   - httpHeaders:      cabeçalhos (o valor pode usar {{token}})
 *   - httpBodyTemplate: corpo em JSON com variáveis {{to}} {{text}} etc.
 *   - httpMsgIdPath:    caminho na resposta para extrair o ID (ex.: "data.id")
 *   - httpToFormat:     como normalizar o telefone
 *
 * Variáveis disponíveis nos templates de header/corpo:
 *   {{to}} {{text}} {{token}} {{templateName}} {{templateParams}}
 */
export class HttpGenericChannel implements MessageChannel {
  readonly type = 'HTTP_GENERIC';
  private readonly http: AxiosInstance;
  private readonly creds: ChannelCredentials;

  constructor(creds: ChannelCredentials) {
    this.creds = creds;
    this.http = axios.create({ ...safeHttpAgents(), timeout: 15000 });
  }

  /** Normaliza o destinatário conforme o formato esperado pelo sistema externo. */
  private formatTo(to: string): string {
    const raw = to || '';
    switch ((this.creds.httpToFormat || 'digits').toLowerCase()) {
      case 'raw':
        return raw;
      case 'e164': {
        let d = raw.replace(/\D/g, '');
        if (d.length <= 11) d = '55' + d;
        return '+' + d;
      }
      case 'digits':
      default: {
        let d = raw.replace(/\D/g, '');
        if (d.length <= 11) d = '55' + d;
        return d;
      }
    }
  }

  /** Substitui {{var}} numa string por texto literal. */
  private replaceVars(s: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce(
      (acc, [k, v]) => acc.split(`{{${k}}}`).join(v),
      s,
    );
  }

  /** Aplica as variáveis recursivamente em todos os valores string de um objeto JSON. */
  private applyVars(node: unknown, vars: Record<string, string>): unknown {
    if (typeof node === 'string') return this.replaceVars(node, vars);
    if (Array.isArray(node)) return node.map((n) => this.applyVars(n, vars));
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = this.applyVars(v, vars);
      return out;
    }
    return node;
  }

  /** Lê um valor por caminho com pontos (ex.: "data.messages.0.id"). */
  private pick(obj: unknown, path?: string): string | undefined {
    if (!path) return undefined;
    let cur: unknown = obj;
    for (const part of path.split('.')) {
      if (cur == null) return undefined;
      cur = (cur as Record<string, unknown>)[part];
    }
    return cur == null ? undefined : String(cur);
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    if (!this.creds.httpUrl) return { status: 'FALHA', erro: 'Endpoint (httpUrl) não configurado' };

    const vars: Record<string, string> = {
      to: this.formatTo(input.to),
      text: input.text ?? '',
      token: this.creds.token ?? this.creds.apiKey ?? '',
      templateName: input.templateName ?? '',
      templateParams: (input.templateParams ?? []).join(', '),
    };

    const method = (this.creds.httpMethod || 'POST').toUpperCase() as Method;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.creds.httpHeaders ?? {})) headers[k] = this.replaceVars(v, vars);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type') && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }

    let body: unknown;
    if (method !== 'GET' && this.creds.httpBodyTemplate?.trim()) {
      let template: unknown;
      try {
        template = JSON.parse(this.creds.httpBodyTemplate);
      } catch {
        return { status: 'FALHA', erro: 'Corpo (httpBodyTemplate) não é um JSON válido' };
      }
      body = this.applyVars(template, vars);
    }

    try {
      const { data } = await this.http.request({ url: this.creds.httpUrl, method, headers, data: body });
      return { providerMsgId: this.pick(data, this.creds.httpMsgIdPath), status: 'ENVIADO' };
    } catch (e) {
      return { status: 'FALHA', erro: axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e) };
    }
  }
}
