import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TemplateCategory, TemplateStatus } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { categorizeTemplate, isCobrancaButMarketing } from './template-category';
import {
  AcessoGraph,
  ComponenteMeta,
  TemplateMeta,
  criarTemplate,
  editarTemplate,
  erroMeta,
  excluirTemplate,
  listarTemplates,
  nomeValidoMeta,
  variaveisDoCorpo,
} from './meta-graph';

interface UpsertTemplateDto {
  nome: string;
  corpo: string;
  idioma?: string;
  categoria?: TemplateCategory; // se omitido, é sugerido pela heurística
  exemplos?: string[]; // valor de exemplo de cada {{n}} — a Meta exige quando há variáveis
  wabaId?: string; // em qual conta criar (quando o tenant tem mais de uma)
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

/**
 * Gestão dos templates HSM do WhatsApp.
 *
 * O template mora na META, não aqui: passa por revisão e só envia depois de
 * aprovado. Criar/editar/excluir falam com o Graph; a tabela local é um espelho
 * que a sincronização atualiza. Editar só o corpo local quebraria o mapeamento de
 * variáveis das campanhas sem mudar nada no que a Meta entrega.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  list(tenantId: string) {
    return this.prisma.whatsAppTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  /** Sugere categoria e alerta se um template de cobrança caiu em marketing (mais caro). */
  categorizar(corpo: string) {
    return { categoria: categorizeTemplate(corpo), alertaCusto: isCobrancaButMarketing(corpo) };
  }

  // ─────────────────────────── Acesso ao Graph ───────────────────────────

  /**
   * Contas WABA que o tenant pode gerenciar, com o token de cada uma.
   * Duas origens: canais do NX (que expõem bmToken) e WhatsApp Cloud configurado
   * direto (token do próprio tenant + wabaId informado no canal).
   */
  async acessos(tenantId: string): Promise<AcessoGraph[]> {
    const contas = await this.prisma.channelAccount.findMany({
      where: { tenantId, ativo: true, canal: { in: ['NX_SYSTEMS', 'WHATSAPP_CLOUD'] } },
    });
    const out: AcessoGraph[] = [];
    const vistos = new Set<string>();

    for (const conta of contas) {
      let creds: { nxBaseUrl?: string; nxToken?: string; nxChannelId?: string; token?: string; wabaId?: string };
      try {
        creds = this.crypto.decryptJson(conta.credentials);
      } catch {
        continue;
      }

      if (conta.canal === 'WHATSAPP_CLOUD') {
        // Sem wabaId não dá para gerenciar templates — o canal segue enviando normalmente.
        if (creds.token && creds.wabaId && !vistos.has(creds.wabaId)) {
          vistos.add(creds.wabaId);
          out.push({ wabaId: creds.wabaId, token: creds.token, versao: '21.0', origem: conta.apelido ?? 'WhatsApp Cloud' });
        }
        continue;
      }

      // NX: só a conexão-base (sem nxChannelId) tem URL+token para consultar os canais.
      if (creds.nxChannelId || !creds.nxBaseUrl || !creds.nxToken) continue;
      for (const a of await this.acessosDoNx(creds.nxBaseUrl, creds.nxToken, conta.apelido ?? 'NX')) {
        if (vistos.has(a.wabaId)) continue;
        vistos.add(a.wabaId);
        out.push(a);
      }
    }
    return out;
  }

  /** Descobre WABAs pelo NX: listChannels → showChannelById (bmToken + wabaVersion). */
  private async acessosDoNx(base: string, nxToken: string, apelido: string): Promise<AcessoGraph[]> {
    const nx = axios.create({
      baseURL: base.replace(/\/$/, ''),
      headers: { Authorization: `Bearer ${nxToken}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    let lista: NxChannel[] = [];
    try {
      const { data } = await nx.get('/listChannels');
      lista = (data?.data ?? []) as NxChannel[];
    } catch {
      return [];
    }

    const out: AcessoGraph[] = [];
    for (const canal of lista.filter((c) => (c.type || '').toLowerCase() === 'waba' && c.wabaId)) {
      let detalhe: NxChannelDetail | null = null;
      try {
        const { data } = await nx.post('/showChannelById', { id: canal.id });
        detalhe = (data?.data ?? null) as NxChannelDetail | null;
      } catch {
        continue;
      }
      const bmToken = detalhe?.bmToken || '';
      const wabaId = detalhe?.wabaId || canal.wabaId || '';
      if (!bmToken || !wabaId) continue;
      out.push({
        wabaId,
        token: bmToken,
        versao: (detalhe?.wabaVersion || '21.0').replace(/^v/i, ''),
        origem: canal.name || apelido,
      });
    }
    return out;
  }

  /** Contas disponíveis para o painel escolher onde criar. */
  async contas(tenantId: string) {
    const acessos = await this.acessos(tenantId);
    return acessos.map((a) => ({ wabaId: a.wabaId, origem: a.origem }));
  }

  private async acessoPara(tenantId: string, wabaId?: string): Promise<AcessoGraph> {
    const acessos = await this.acessos(tenantId);
    if (acessos.length === 0) {
      throw new BadRequestException(
        'Nenhuma conta do WhatsApp oficial disponível. Conecte o NX Systems ou informe o WABA ID no canal WhatsApp API oficial, em Canais.',
      );
    }
    if (!wabaId) return acessos[0];
    const a = acessos.find((x) => x.wabaId === wabaId);
    if (!a) throw new BadRequestException('Conta do WhatsApp não encontrada. Sincronize os canais e tente de novo.');
    return a;
  }

  // ─────────────────────────── CRUD na Meta ───────────────────────────

  private validar(dto: UpsertTemplateDto) {
    if (!dto.corpo?.trim()) throw new BadRequestException('Escreva o corpo do template.');
    const vars = variaveisDoCorpo(dto.corpo);
    const esperado = vars.map((_, i) => i + 1);
    if (vars.join(',') !== esperado.join(',')) {
      throw new BadRequestException(
        `As variáveis precisam ser sequenciais a partir de {{1}} — a Meta recusa buracos. Encontrei: ${vars.map((n) => `{{${n}}}`).join(', ') || 'nenhuma'}.`,
      );
    }
    if (dto.corpo.length > 1024) throw new BadRequestException('O corpo passa de 1024 caracteres, o limite da Meta.');
  }

  /**
   * Cria na Meta e espelha localmente como PENDENTE.
   * Não dá para enviar até a Meta aprovar (minutos a 24h).
   */
  async create(tenantId: string, dto: UpsertTemplateDto) {
    if (!nomeValidoMeta(dto.nome ?? '')) {
      throw new BadRequestException('O nome só aceita letras minúsculas, números e underscore (ex.: boleto_gerado) — é regra da Meta.');
    }
    this.validar(dto);
    const acesso = await this.acessoPara(tenantId, dto.wabaId);
    const categoria = dto.categoria ?? categorizeTemplate(dto.corpo);
    const idioma = dto.idioma ?? 'pt_BR';

    let criado: { id: string; status?: string; category?: string };
    try {
      criado = await criarTemplate(acesso, { nome: dto.nome, idioma, categoria, corpo: dto.corpo, exemplos: dto.exemplos });
    } catch (e) {
      throw new BadRequestException(`A Meta recusou a criação: ${erroMeta(e)}`);
    }

    return this.prisma.whatsAppTemplate.create({
      data: {
        tenantId,
        nome: dto.nome,
        corpo: dto.corpo,
        idioma,
        categoria: this.mapCategoria(criado.category) ?? categoria,
        status: this.mapStatus(criado.status ?? 'PENDING'),
        externalId: String(criado.id),
      },
    });
  }

  /**
   * Edita na Meta. Nome e idioma são imutáveis lá, então ignoramos qualquer troca:
   * mudar só o nome local faria a campanha enviar um template que não existe.
   */
  async update(tenantId: string, id: string, dto: UpsertTemplateDto) {
    const atual = await this.getOrThrow(tenantId, id);
    this.validar(dto);
    if (!atual.externalId) {
      throw new BadRequestException('Este template não existe na Meta (importado de uma versão antiga). Exclua e crie de novo.');
    }
    if (atual.status === TemplateStatus.PENDENTE) {
      throw new BadRequestException('Template em revisão na Meta — só dá para editar depois de aprovado ou rejeitado.');
    }
    const acesso = await this.acessoPara(tenantId);
    const categoria = dto.categoria ?? atual.categoria;
    try {
      await editarTemplate(acesso, atual.externalId, { categoria, corpo: dto.corpo, exemplos: dto.exemplos });
    } catch (e) {
      throw new BadRequestException(`A Meta recusou a edição: ${erroMeta(e)}`);
    }
    // Editar devolve o template para revisão.
    return this.prisma.whatsAppTemplate.update({
      where: { id },
      data: { corpo: dto.corpo, categoria, status: TemplateStatus.PENDENTE },
    });
  }

  /** Exclui na Meta e no espelho local. O nome fica bloqueado por 30 dias lá. */
  async remove(tenantId: string, id: string) {
    const t = await this.getOrThrow(tenantId, id);
    if (t.externalId) {
      const acesso = await this.acessoPara(tenantId);
      try {
        await excluirTemplate(acesso, t.nome, t.externalId);
      } catch (e) {
        throw new BadRequestException(`A Meta recusou a exclusão: ${erroMeta(e)}`);
      }
    }
    await this.prisma.whatsAppTemplate.delete({ where: { id } });
    return { ok: true };
  }

  // ─────────────────────────── Sincronização ───────────────────────────

  /** Espelha os templates da Meta na tabela local (fonte da verdade é a Meta). */
  async sincronizar(tenantId: string) {
    const acessos = await this.acessos(tenantId);
    if (acessos.length === 0) {
      throw new BadRequestException(
        'Nenhuma conta do WhatsApp oficial encontrada. Conecte o NX Systems ou informe o WABA ID no canal WhatsApp API oficial, em Canais.',
      );
    }

    let importados = 0;
    let atualizados = 0;
    const erros: string[] = [];
    const vistosExternos = new Set<string>();

    for (const acesso of acessos) {
      let metaTemplates: TemplateMeta[] = [];
      try {
        metaTemplates = await listarTemplates(acesso);
      } catch (e) {
        erros.push(`${acesso.origem}: ${erroMeta(e)}`);
        continue;
      }

      for (const t of metaTemplates) {
        const externalId = String(t.id);
        vistosExternos.add(externalId);
        const dados = {
          nome: t.name,
          idioma: t.language ?? 'pt_BR',
          categoria: this.mapCategoria(t.category) ?? TemplateCategory.UTILITY,
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

    // Apagado na Meta some daqui: manter um template morto na lista faria a campanha
    // oferecer algo que o envio recusaria.
    let removidos = 0;
    if (!erros.length && vistosExternos.size) {
      const r = await this.prisma.whatsAppTemplate.deleteMany({
        where: { tenantId, externalId: { not: null, notIn: [...vistosExternos] } },
      });
      removidos = r.count;
    }

    return { canais: acessos.length, importados, atualizados, removidos, erros };
  }

  private mapCategoria(c?: string): TemplateCategory | null {
    const up = (c || '').toUpperCase();
    if (up === 'MARKETING') return TemplateCategory.MARKETING;
    if (up === 'AUTHENTICATION') return TemplateCategory.AUTHENTICATION;
    if (up === 'UTILITY') return TemplateCategory.UTILITY;
    return null;
  }

  private mapStatus(s?: string): TemplateStatus {
    const up = (s || '').toUpperCase();
    if (up === 'APPROVED') return TemplateStatus.APROVADO;
    if (['REJECTED', 'DISABLED', 'PAUSED'].includes(up)) return TemplateStatus.REJEITADO;
    if (['PENDING', 'IN_APPEAL', 'PENDING_DELETION'].includes(up)) return TemplateStatus.PENDENTE;
    return TemplateStatus.RASCUNHO;
  }

  private corpoDeComponents(components?: ComponenteMeta[]): string {
    const body = (components || []).find((c) => (c.type || '').toUpperCase() === 'BODY');
    return body?.text ?? '';
  }

  private async getOrThrow(tenantId: string, id: string) {
    const t = await this.prisma.whatsAppTemplate.findFirst({ where: { id, tenantId } });
    if (!t) throw new NotFoundException('Template não encontrado');
    return t;
  }
}
