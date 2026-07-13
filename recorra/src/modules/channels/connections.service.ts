import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { env } from '@/config/env';

type Creds = {
  apiUrl?: string; apiKey?: string; instance?: string; token?: string; phoneId?: string; from?: string; provider?: string;
  // HTTP genérico (API aberta)
  httpUrl?: string; httpMethod?: string; httpHeaders?: Record<string, string>; httpBodyTemplate?: string; httpMsgIdPath?: string; httpToFormat?: string;
};

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
      return { id: r.id, canal: r.canal, apelido: r.apelido, ativo: r.ativo, status, instance: c.instance ?? null, createdAt: r.createdAt };
    }));
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
