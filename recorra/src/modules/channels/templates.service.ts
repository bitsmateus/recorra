import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TemplateCategory, TemplateStatus } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { categorizeTemplate, isCobrancaButMarketing } from './template-category';

interface UpsertTemplateDto {
  nome: string;
  corpo: string;
  idioma?: string;
  categoria?: TemplateCategory; // se omitido, é sugerido pela heurística
}

// ---- Formatos da API do NX Systems (listChannels / showChannelById) ----
interface NxChannel {
  id: number;
  name?: string;
  type?: string; // "waba" (oficial) | "uazapi" | ...
  status?: string;
  wabaId?: string | null;
  tokenAPI?: string | null; // no canal WABA é o Phone Number ID, NÃO o token
}
interface NxChannelDetail extends NxChannel {
  bmToken?: string | null; // token do Business Manager (Graph) — só vem no detalhe
  wabaVersion?: string | null; // ex.: "25.0"
}

// ---- Formato da API do Graph (message_templates) ----
interface MetaTemplate {
  id: string;
  name: string;
  language?: string;
  category?: string; // UTILITY | MARKETING | AUTHENTICATION
  status?: string; // APPROVED | PENDING | REJECTED | ...
  components?: { type?: string; text?: string }[];
}

/** Gestão de templates HSM do WhatsApp com categorização utility/marketing. */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  list(tenantId: string) {
    return this.prisma.whatsAppTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async create(tenantId: string, dto: UpsertTemplateDto) {
    const categoria = dto.categoria ?? categorizeTemplate(dto.corpo);
    return this.prisma.whatsAppTemplate.create({
      data: { tenantId, nome: dto.nome, corpo: dto.corpo, idioma: dto.idioma ?? 'pt_BR', categoria },
    });
  }

  async update(tenantId: string, id: string, dto: UpsertTemplateDto) {
    await this.getOrThrow(tenantId, id);
    const categoria = dto.categoria ?? categorizeTemplate(dto.corpo);
    return this.prisma.whatsAppTemplate.update({ where: { id }, data: { nome: dto.nome, corpo: dto.corpo, categoria } });
  }

  async remove(tenantId: string, id: string) {
    await this.getOrThrow(tenantId, id);
    await this.prisma.whatsAppTemplate.delete({ where: { id } });
    return { ok: true };
  }

  /** Sugere categoria e alerta se um template de cobrança caiu em marketing (mais caro). */
  categorizar(corpo: string) {
    return { categoria: categorizeTemplate(corpo), alertaCusto: isCobrancaButMarketing(corpo) };
  }

  // ─────────────────────────── Sincronização com a Meta via NX ───────────────────────────

  /**
   * Puxa os templates aprovados diretamente do Graph da Meta.
   * Como o número está sob o NX, obtemos wabaId + bmToken (token do Graph) via API do NX:
   *   1) GET  {nxBaseUrl}/listChannels        → canais type="waba" com wabaId
   *   2) POST {nxBaseUrl}/showChannelById {id} → bmToken (Business Manager) + wabaVersion
   *   3) GET  graph.facebook.com/v{versão}/{wabaId}/message_templates
   */
  async sincronizar(tenantId: string) {
    const contas = await this.prisma.channelAccount.findMany({ where: { tenantId, canal: 'NX_SYSTEMS' } });
    if (contas.length === 0) throw new BadRequestException('Nenhum canal NX Systems configurado para sincronizar templates.');

    let canaisWaba = 0;
    let importados = 0;
    let atualizados = 0;
    const erros: string[] = [];

    for (const conta of contas) {
      let creds: { nxBaseUrl?: string; nxToken?: string };
      try { creds = this.crypto.decryptJson<{ nxBaseUrl?: string; nxToken?: string }>(conta.credentials); } catch { continue; }
      const base = (creds.nxBaseUrl || '').replace(/\/$/, '');
      const nxToken = creds.nxToken || '';
      if (!base || !nxToken) continue;

      const nx = axios.create({
        baseURL: base,
        headers: { Authorization: `Bearer ${nxToken}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      // 1) Lista os canais do NX
      let lista: NxChannel[] = [];
      try {
        const { data } = await nx.get('/listChannels');
        lista = (data?.data ?? []) as NxChannel[];
      } catch (e) {
        erros.push(`listChannels (${conta.apelido}): ${this.axErr(e)}`);
        continue;
      }

      const wabas = lista.filter((c) => (c.type || '').toLowerCase() === 'waba' && c.wabaId);
      for (const canal of wabas) {
        // 2) Detalhe do canal → bmToken + wabaVersion
        let detalhe: NxChannelDetail | null = null;
        try {
          const { data } = await nx.post('/showChannelById', { id: canal.id });
          detalhe = (data?.data ?? null) as NxChannelDetail | null;
        } catch (e) {
          erros.push(`showChannelById #${canal.id}: ${this.axErr(e)}`);
          continue;
        }

        const bmToken = detalhe?.bmToken || '';
        const wabaId = detalhe?.wabaId || canal.wabaId || '';
        if (!bmToken) {
          erros.push(`Canal "${canal.name ?? canal.id}" sem bmToken (sem acesso ao Graph da Meta).`);
          continue;
        }
        canaisWaba++;

        // 3) Templates na Meta (paginado)
        const versao = (detalhe?.wabaVersion || '21.0').replace(/^v/i, '');
        let metaTemplates: MetaTemplate[] = [];
        try {
          metaTemplates = await this.buscarTemplatesMeta(wabaId, bmToken, versao);
        } catch (e) {
          erros.push(`Meta WABA ${wabaId}: ${this.axErr(e)}`);
          continue;
        }

        for (const t of metaTemplates) {
          const externalId = String(t.id);
          const dados = {
            nome: t.name,
            idioma: t.language ?? 'pt_BR',
            categoria: this.mapCategoria(t.category),
            status: this.mapStatus(t.status),
            corpo: this.corpoDeComponents(t.components),
          };
          const existente = await this.prisma.whatsAppTemplate.findFirst({ where: { tenantId, externalId } });
          if (existente) {
            await this.prisma.whatsAppTemplate.update({ where: { id: existente.id }, data: dados });
            atualizados++;
          } else {
            await this.prisma.whatsAppTemplate.create({ data: { tenantId, externalId, ...dados } });
            importados++;
          }
        }
      }
    }

    return { canais: canaisWaba, importados, atualizados, erros };
  }

  /** Busca todos os templates de uma WABA no Graph, seguindo a paginação. */
  private async buscarTemplatesMeta(wabaId: string, token: string, versao: string): Promise<MetaTemplate[]> {
    const out: MetaTemplate[] = [];
    let url: string | null = `https://graph.facebook.com/v${versao}/${wabaId}/message_templates`;
    let params: Record<string, unknown> | undefined = {
      fields: 'name,status,category,language,components',
      limit: 100,
      access_token: token,
    };
    let guard = 0;
    while (url && guard++ < 20) {
      const resp: { data: { data?: MetaTemplate[]; paging?: { next?: string } } } = await axios.get(url, { params, timeout: 15000 });
      const body = resp.data;
      out.push(...(body.data ?? []));
      url = body.paging?.next ?? null; // 'next' já traz a querystring completa
      params = undefined;
    }
    return out;
  }

  private mapCategoria(c?: string): TemplateCategory {
    const up = (c || '').toUpperCase();
    if (up === 'MARKETING') return TemplateCategory.MARKETING;
    if (up === 'AUTHENTICATION') return TemplateCategory.AUTHENTICATION;
    return TemplateCategory.UTILITY;
  }

  private mapStatus(s?: string): TemplateStatus {
    const up = (s || '').toUpperCase();
    if (up === 'APPROVED') return TemplateStatus.APROVADO;
    if (['REJECTED', 'DISABLED', 'PAUSED'].includes(up)) return TemplateStatus.REJEITADO;
    if (['PENDING', 'IN_APPEAL', 'PENDING_DELETION'].includes(up)) return TemplateStatus.PENDENTE;
    return TemplateStatus.RASCUNHO;
  }

  private corpoDeComponents(components?: { type?: string; text?: string }[]): string {
    const body = (components || []).find((c) => (c.type || '').toUpperCase() === 'BODY');
    return body?.text ?? '';
  }

  private axErr(e: unknown): string {
    return axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e);
  }

  private async getOrThrow(tenantId: string, id: string) {
    const t = await this.prisma.whatsAppTemplate.findFirst({ where: { id, tenantId } });
    if (!t) throw new NotFoundException('Template não encontrado');
    return t;
  }
}
