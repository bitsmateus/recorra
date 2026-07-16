import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { env } from '@/config/env';
import { EmailChannel } from './providers/email.channel';
import { ChannelCredentials } from './message-channel.interface';

type Creds = {
  apiUrl?: string; apiKey?: string; instance?: string; token?: string; phoneId?: string; from?: string; provider?: string;
  // E-mail: Resend (apiKey) ou SMTP próprio
  emailProvider?: 'resend' | 'smtp';
  smtpHost?: string; smtpPort?: number; smtpSecure?: boolean; smtpUser?: string; smtpPass?: string;
  // HTTP genérico (API aberta)
  httpUrl?: string; httpMethod?: string; httpHeaders?: Record<string, string>; httpBodyTemplate?: string; httpMsgIdPath?: string; httpToFormat?: string;
  // NX Systems (conexão-base + canais importados)
  nxBaseUrl?: string; nxToken?: string; nxOficial?: boolean;
  nxChannelId?: string; // id do canal no NX (marca conexões importadas)
  nxType?: string | null; // "waba" (oficial) | "uazapi" | ...
  nxName?: string | null; nxStatus?: string | null; tokenAPI?: string | null; wabaId?: string | null;
};

// Canal retornado pelo endpoint /listChannels do NX.
interface NxCanal { id: number; name?: string | null; type?: string | null; status?: string | null; wabaId?: string | null; tokenAPI?: string | null }

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private evo() {
    if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY) throw new BadRequestException('Servidor Evolution não configurado pela plataforma.');
    return axios.create({ baseURL: env.EVOLUTION_API_URL.replace(/\/$/, ''), headers: { apikey: env.EVOLUTION_API_KEY }, timeout: 15000 });
  }
  private uaz() {
    if (!env.UAZAPI_API_URL || !env.UAZAPI_API_KEY) throw new BadRequestException('Servidor uazapi não configurado pela plataforma.');
    return axios.create({ baseURL: env.UAZAPI_API_URL.replace(/\/$/, ''), headers: { apikey: env.UAZAPI_API_KEY, token: env.UAZAPI_API_KEY }, timeout: 15000 });
  }

  private creds(id: string, enc: string): Creds {
    void id;
    try { return this.crypto.decryptJson<Creds>(enc); } catch { return {}; }
  }

  /** Lista as conexões do tenant com status ao vivo (WhatsApp não-oficial). */
  async list(tenantId: string) {
    const rows = await this.prisma.channelAccount.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return Promise.all(rows.map(async (r) => {
      const c = this.creds(r.id, r.credentials);
      let status = 'CONFIGURADO';
      if (r.canal === 'WHATSAPP_EVOLUTION' && c.instance) status = await this.statusEvolution(c.instance).catch(() => 'DESCONECTADO');
      if (r.canal === 'WHATSAPP_UAZAPI' && c.instance) status = await this.statusUazapi(c.instance).catch(() => 'DESCONECTADO');
      if (r.canal === 'NX_SYSTEMS' && c.nxStatus) status = c.nxStatus === 'CONNECTED' ? 'CONECTADO' : 'DESCONECTADO';
      return {
        id: r.id, canal: r.canal, apelido: r.apelido, ativo: r.ativo, status,
        instance: c.instance ?? null, createdAt: r.createdAt,
        // Metadados dos canais NX importados (para exibir organizado em Canais).
        origem: c.nxChannelId ? 'nx' : undefined,
        oficial: r.canal === 'NX_SYSTEMS' ? !!c.nxOficial : undefined,
        nxType: c.nxType ?? undefined,
      };
    }));
  }

  /**
   * Importa os canais do NX (oficiais e não oficiais) como conexões na Recorra.
   * Usa a(s) conexão(ões)-base NX (URL + token) para chamar /listChannels e faz
   * upsert por nxChannelId. Remover na Recorra só apaga localmente; re-sincronizar traz de volta.
   */
  async sincronizarNx(tenantId: string) {
    const contas = await this.prisma.channelAccount.findMany({ where: { tenantId, canal: 'NX_SYSTEMS' } });
    const decifradas = contas.map((c) => ({ conta: c, creds: this.creds(c.id, c.credentials) }));
    const bases = decifradas.filter((c) => c.creds.nxBaseUrl && c.creds.nxToken && !c.creds.nxChannelId);
    if (bases.length === 0) throw new BadRequestException('Configure primeiro a integração NX (URL base + token) para sincronizar os canais.');

    let importados = 0;
    let atualizados = 0;
    const erros: string[] = [];

    for (const base of bases) {
      const nx = axios.create({
        baseURL: (base.creds.nxBaseUrl ?? '').replace(/\/$/, ''),
        headers: { Authorization: `Bearer ${base.creds.nxToken}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      let lista: NxCanal[] = [];
      try {
        const { data } = await nx.get('/listChannels');
        lista = (data?.data ?? []) as NxCanal[];
      } catch (e) {
        erros.push(`listChannels (${base.conta.apelido}): ${this.axErr(e)}`);
        continue;
      }

      for (const canal of lista) {
        const nxChannelId = String(canal.id);
        const oficial = (canal.type || '').toLowerCase() === 'waba';
        const creds: Creds = {
          nxBaseUrl: base.creds.nxBaseUrl,
          nxToken: base.creds.nxToken,
          nxOficial: oficial,
          nxChannelId,
          nxType: canal.type ?? null,
          nxName: canal.name ?? null,
          nxStatus: canal.status ?? null,
          tokenAPI: canal.tokenAPI ?? null,
          wabaId: canal.wabaId ?? null,
        };
        const apelido = canal.name?.trim() || `Canal NX #${canal.id}`;
        const existente = decifradas.find((c) => c.creds.nxChannelId === nxChannelId);
        if (existente) {
          await this.prisma.channelAccount.update({ where: { id: existente.conta.id }, data: { apelido, credentials: this.crypto.encryptJson(creds) } });
          atualizados++;
        } else {
          const criado = await this.prisma.channelAccount.create({ data: { tenantId, canal: 'NX_SYSTEMS', apelido, ativo: true, credentials: this.crypto.encryptJson(creds) } });
          decifradas.push({ conta: criado, creds }); // evita duplicar se o NX repetir o id na mesma resposta
          importados++;
        }
      }
    }

    return { importados, atualizados, erros };
  }

  private axErr(e: unknown): string {
    return axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e);
  }

  // ---------- criação por tipo ----------

  async criar(tenantId: string, dto: { canal: ChannelType; apelido: string; credentials?: Record<string, unknown> }) {
    if (!dto.apelido?.trim()) throw new BadRequestException('Dê um nome para a conexão');
    switch (dto.canal) {
      case 'WHATSAPP_EVOLUTION': return this.criarEvolution(tenantId, dto.apelido);
      case 'WHATSAPP_UAZAPI': return this.criarUazapi(tenantId, dto.apelido);
      case 'WHATSAPP_CLOUD':
      case 'EMAIL':
      case 'SMS':
        return this.criarComCredenciais(tenantId, dto.canal, dto.apelido, (dto.credentials ?? {}) as Creds);
      case 'HTTP_GENERIC':
        return this.criarHttpGenerico(tenantId, dto.apelido, (dto.credentials ?? {}) as Creds);
      case 'NX_SYSTEMS':
        return this.criarNx(tenantId, dto.apelido, (dto.credentials ?? {}) as Creds);
      default: throw new BadRequestException('Canal inválido');
    }
  }

  private async criarComCredenciais(tenantId: string, canal: ChannelType, apelido: string, credentials: Creds) {
    const created = await this.prisma.channelAccount.create({
      data: { tenantId, canal, apelido, ativo: true, credentials: this.crypto.encryptJson(credentials) },
    });
    return { id: created.id, canal, apelido, status: 'CONFIGURADO' };
  }

  /** Cria um canal HTTP genérico (API aberta) validando URL e template do corpo. */
  private async criarHttpGenerico(tenantId: string, apelido: string, credentials: Creds) {
    const url = (credentials.httpUrl ?? '').trim();
    if (!/^https?:\/\//i.test(url)) throw new BadRequestException('Informe uma URL de endpoint válida (http/https).');
    const method = (credentials.httpMethod ?? 'POST').toUpperCase();
    if (!['POST', 'PUT', 'GET'].includes(method)) throw new BadRequestException('Método deve ser POST, PUT ou GET.');
    if (method !== 'GET' && credentials.httpBodyTemplate?.trim()) {
      try { JSON.parse(credentials.httpBodyTemplate); }
      catch { throw new BadRequestException('O corpo (body) precisa ser um JSON válido.'); }
    }
    const clean: Creds = {
      httpUrl: url,
      httpMethod: method,
      httpHeaders: credentials.httpHeaders ?? {},
      httpBodyTemplate: credentials.httpBodyTemplate ?? '',
      httpMsgIdPath: (credentials.httpMsgIdPath ?? '').trim(),
      httpToFormat: credentials.httpToFormat ?? 'digits',
      token: credentials.token ?? '',
    };
    return this.criarComCredenciais(tenantId, 'HTTP_GENERIC', apelido, clean);
  }

  /** Cria a integração nativa NX Systems (só URL base + token; oficial ou não). */
  private async criarNx(tenantId: string, apelido: string, credentials: Creds) {
    const url = (credentials.nxBaseUrl ?? '').trim();
    if (!/^https?:\/\//i.test(url)) throw new BadRequestException('Informe a URL base da NX (ex.: https://webapi.nxsystems.com.br/v2/api/external/SEU_APIID).');
    if (!(credentials.nxToken ?? '').trim()) throw new BadRequestException('Informe o token de acesso da NX.');
    const clean: Creds = {
      nxBaseUrl: url.replace(/\/$/, ''),
      nxToken: (credentials.nxToken ?? '').trim(),
      nxOficial: credentials.nxOficial === true,
    };
    return this.criarComCredenciais(tenantId, 'NX_SYSTEMS', apelido, clean);
  }

  /** Testa se a URL/token respondem (não envia mensagem, não detecta oficial x não oficial). */
  async testar(dto: { canal: ChannelType; credentials?: Record<string, unknown> }) {
    const c = (dto.credentials ?? {}) as Creds;
    const url = (dto.canal === 'NX_SYSTEMS' ? c.nxBaseUrl : c.httpUrl) ?? '';
    const token = (dto.canal === 'NX_SYSTEMS' ? c.nxToken : c.token) ?? '';
    if (!/^https?:\/\//i.test(url.trim())) throw new BadRequestException('Informe uma URL válida (http/https).');
    try {
      const res = await axios.get(url.trim().replace(/\/$/, ''), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: 10000,
        validateStatus: () => true,
      });
      if (res.status === 401 || res.status === 403) return { ok: false, mensagem: `Token rejeitado (HTTP ${res.status}). Verifique o token.` };
      return { ok: true, mensagem: `Conexão OK — a API respondeu (HTTP ${res.status}).` };
    } catch (e) {
      return { ok: false, mensagem: `Não foi possível alcançar a URL: ${axios.isAxiosError(e) ? e.message : String(e)}` };
    }
  }

  /**
   * Valida as credenciais do WhatsApp Cloud direto na Meta (somente leitura, não envia mensagem).
   * Consulta o número pelo Phone Number ID; 200 = token e ID válidos.
   */
  async testarWhatsAppCloud(dto: { credentials?: Record<string, unknown> }) {
    const c = (dto.credentials ?? {}) as Creds;
    const phoneId = (c.phoneId ?? '').trim();
    const token = (c.token ?? '').trim();
    if (!phoneId) return { ok: false, mensagem: 'Informe o Phone Number ID.' };
    if (!token) return { ok: false, mensagem: 'Informe o token de acesso.' };

    try {
      const { status, data } = await axios.get(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}`, {
        params: { fields: 'verified_name,display_phone_number,quality_rating' },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
        validateStatus: () => true,
      });
      if (status === 200) {
        const nome = data?.verified_name ? ` — ${data.verified_name}` : '';
        const numero = data?.display_phone_number ? ` (${data.display_phone_number})` : '';
        const qualidade = data?.quality_rating ? ` · qualidade: ${data.quality_rating}` : '';
        return { ok: true, mensagem: `Conexão OK${nome}${numero}${qualidade}` };
      }
      if (status === 401 || status === 403) return { ok: false, mensagem: 'Token inválido ou sem permissão para este número (HTTP ' + status + ').' };
      if (status === 404) return { ok: false, mensagem: 'Phone Number ID não encontrado — confira o ID no WhatsApp Manager.' };
      const erro = data?.error?.message ?? JSON.stringify(data);
      return { ok: false, mensagem: `A Meta recusou (HTTP ${status}): ${erro}` };
    } catch (e) {
      return { ok: false, mensagem: `Não foi possível falar com a Meta: ${axios.isAxiosError(e) ? e.message : String(e)}` };
    }
  }

  /** Envia um e-mail de teste com as credenciais informadas (Resend ou SMTP), sem salvar nada. */
  async testarEmail(dto: { credentials?: Record<string, unknown>; para?: string }) {
    const para = (dto.para ?? '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return { ok: false, mensagem: 'Informe um e-mail de destino válido.' };

    const c = (dto.credentials ?? {}) as Creds;
    if (c.emailProvider === 'smtp') {
      if (!c.smtpHost) return { ok: false, mensagem: 'Informe o servidor SMTP (host).' };
    } else if (!c.apiKey) {
      return { ok: false, mensagem: 'Informe a API key do Resend.' };
    }

    const canal = new EmailChannel(c as ChannelCredentials);
    const r = await canal.send({
      to: para,
      text: 'Este é um e-mail de teste do Recorra. Se você recebeu, o canal está configurado corretamente.',
      templateName: 'Teste de configuração — Recorra',
    });
    return r.status === 'ENVIADO'
      ? { ok: true, mensagem: `E-mail de teste enviado para ${para}. Confira a caixa de entrada (e o spam).` }
      : { ok: false, mensagem: `Falha ao enviar: ${r.erro ?? 'erro desconhecido'}` };
  }

  private slug(s: string) { return s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24); }

  private async criarEvolution(tenantId: string, apelido: string) {
    const instance = `recorra-${this.slug(apelido)}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      await this.evo().post('/instance/create', { instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' });
    } catch (e) {
      throw new BadRequestException(`Falha ao criar instância na Evolution: ${axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e)}`);
    }
    const created = await this.prisma.channelAccount.create({
      data: { tenantId, canal: 'WHATSAPP_EVOLUTION', apelido, ativo: true, credentials: this.crypto.encryptJson({ apiUrl: env.EVOLUTION_API_URL, apiKey: env.EVOLUTION_API_KEY, instance }) },
    });
    return { id: created.id, canal: 'WHATSAPP_EVOLUTION', apelido, instance, status: 'CONECTANDO' };
  }

  private async criarUazapi(tenantId: string, apelido: string) {
    const instance = `recorra-${this.slug(apelido)}-${Math.random().toString(36).slice(2, 7)}`;
    let token = env.UAZAPI_API_KEY;
    try {
      const { data } = await this.uaz().post('/instance/init', { name: instance });
      token = data?.token ?? data?.instance?.token ?? token;
    } catch (e) {
      throw new BadRequestException(`Falha ao criar instância na uazapi: ${axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e)}`);
    }
    const created = await this.prisma.channelAccount.create({
      data: { tenantId, canal: 'WHATSAPP_UAZAPI', apelido, ativo: true, credentials: this.crypto.encryptJson({ apiUrl: env.UAZAPI_API_URL, apiKey: env.UAZAPI_API_KEY, instance, token }) },
    });
    return { id: created.id, canal: 'WHATSAPP_UAZAPI', apelido, instance, status: 'CONECTANDO' };
  }

  // ---------- QR / status ----------

  async qrcode(tenantId: string, id: string) {
    const acc = await this.getOrThrow(tenantId, id);
    const c = this.creds(id, acc.credentials);
    if (!c.instance) throw new BadRequestException('Esta conexão não usa QR code');
    try {
      if (acc.canal === 'WHATSAPP_EVOLUTION') {
        const { data } = await this.evo().get(`/instance/connect/${c.instance}`);
        return { qr: data?.base64 ?? null, code: data?.code ?? data?.pairingCode ?? null };
      }
      const { data } = await this.uaz().get(`/instance/qrcode/${c.instance}`).catch(() => this.uaz().get('/instance/qrcode', { params: { instance: c.instance } }));
      return { qr: data?.qrcode ?? data?.base64 ?? null, code: data?.code ?? null };
    } catch (e) {
      throw new BadRequestException(`Falha ao obter QR code: ${axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e)}`);
    }
  }

  private async statusEvolution(instance: string): Promise<string> {
    const { data } = await this.evo().get(`/instance/connectionState/${instance}`);
    const st = data?.instance?.state ?? data?.state;
    return st === 'open' ? 'CONECTADO' : st === 'connecting' ? 'CONECTANDO' : 'DESCONECTADO';
  }
  private async statusUazapi(instance: string): Promise<string> {
    const { data } = await this.uaz().get(`/instance/status/${instance}`).catch(() => this.uaz().get('/instance/status', { params: { instance } }));
    const st = String(data?.status ?? data?.state ?? '').toLowerCase();
    return st.includes('open') || st.includes('connected') ? 'CONECTADO' : st.includes('connect') ? 'CONECTANDO' : 'DESCONECTADO';
  }

  async status(tenantId: string, id: string) {
    const acc = await this.getOrThrow(tenantId, id);
    const c = this.creds(id, acc.credentials);
    if (acc.canal === 'WHATSAPP_EVOLUTION' && c.instance) return { status: await this.statusEvolution(c.instance).catch(() => 'DESCONECTADO') };
    if (acc.canal === 'WHATSAPP_UAZAPI' && c.instance) return { status: await this.statusUazapi(c.instance).catch(() => 'DESCONECTADO') };
    return { status: 'CONFIGURADO' };
  }

  async remove(tenantId: string, id: string) {
    const acc = await this.getOrThrow(tenantId, id);
    const c = this.creds(id, acc.credentials);
    if (c.instance) {
      try {
        if (acc.canal === 'WHATSAPP_EVOLUTION') { await this.evo().delete(`/instance/logout/${c.instance}`).catch(() => undefined); await this.evo().delete(`/instance/delete/${c.instance}`).catch(() => undefined); }
        if (acc.canal === 'WHATSAPP_UAZAPI') { await this.uaz().delete(`/instance/${c.instance}`).catch(() => undefined); }
      } catch { /* ignora erro de limpeza no servidor */ }
    }
    await this.prisma.channelAccount.delete({ where: { id } });
    return { ok: true };
  }

  private async getOrThrow(tenantId: string, id: string) {
    const acc = await this.prisma.channelAccount.findFirst({ where: { id, tenantId } });
    if (!acc) throw new NotFoundException('Conexão não encontrada');
    return acc;
  }
}
