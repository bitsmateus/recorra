import { Controller, Get, Header, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { TenantId } from '@/common/auth/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { parseDateFilter } from '@/common/util/parse';
import { toCsv } from '../reports/csv';

const WHATS = ['WHATSAPP_CLOUD', 'WHATSAPP_EVOLUTION', 'WHATSAPP_UAZAPI'];

/** Trecho que vai na listagem. O texto inteiro só em GET /disparos/:id — mandar
 *  mensagens completas em 20 linhas infla a resposta sem ninguém ler. */
const PREVIA = 280;

/** Teto do CSV. Acima disso o cliente precisa apertar o filtro: gerar arquivo de
 *  centenas de MB derruba a memória da API e ninguém abre o resultado. */
const EXPORT_MAX = 20_000;
const EXPORT_LOTE = 2_000;

const INCLUDE = {
  customer: { select: { nome: true, telefone: true } },
  channelAccount: { select: { apelido: true } },
};

interface FiltrosQuery {
  status?: string;
  tipoCanal?: string;
  channelAccountId?: string;
  campanhaId?: string;
  q?: string;
  de?: string;
  ate?: string;
}

/** Só o que `mapear` consome — evita arrastar o tipo gerado do Prisma. */
interface LinhaBanco {
  id: string;
  canal: string;
  campaignId: string | null;
  ruleId: string | null;
  ruleNome: string | null;
  conteudo: string | null;
  status: string;
  erro: string | null;
  enviadoEm: Date | null;
  createdAt: Date;
  customer?: { nome: string; telefone: string | null } | null;
  channelAccount?: { apelido: string | null } | null;
}

/**
 * Cursor opaco = (createdAt, id) da última linha da página. Paginação por keyset
 * em vez de OFFSET: `skip: 20000` obriga o Postgres a ler e descartar 20 mil
 * linhas antes de devolver a página 1001; o cursor pula direto pelo índice, e a
 * última página custa o mesmo que a primeira.
 */
function encodeCursor(r: { createdAt: Date; id: string }): string {
  return Buffer.from(`${r.createdAt.getTime()}.${r.id}`).toString('base64url');
}

function decodeCursor(c?: string): { createdAt: Date; id: string } | undefined {
  if (!c) return undefined;
  const [ms, id] = Buffer.from(c, 'base64url').toString('utf8').split('.');
  const createdAt = new Date(Number(ms));
  // Cursor adulterado (ou de uma versão antiga): ignora e volta ao início, em vez
  // de deixar uma data inválida chegar no Prisma e virar 500.
  if (!id || Number.isNaN(createdAt.getTime())) return undefined;
  return { createdAt, id };
}

const dataBr = (d?: Date | null) =>
  d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';

@Controller('disparos')
@UseGuards(JwtAuthGuard)
export class DispatchesController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Monta o `where` a partir dos filtros da tela. Compartilhado por lista, resumo
   * e export — os três precisam recortar exatamente o mesmo conjunto, senão os
   * cartões mostram um número e a tabela outro.
   */
  private buildWhere(tenantId: string, f: FiltrosQuery) {
    const where: any = { tenantId };
    // SUCESSO agrupa os três status de "deu certo" — é o que o cartão "Enviados"
    // conta, então clicar nele precisa filtrar o mesmo conjunto.
    if (f.status === 'SUCESSO') where.status = { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] };
    else if (f.status) where.status = f.status;
    if (f.channelAccountId) where.channelAccountId = f.channelAccountId;
    if (f.campanhaId) where.campaignId = f.campanhaId;
    if (f.tipoCanal === 'WHATSAPP') where.canal = { in: WHATS };
    else if (f.tipoCanal) where.canal = f.tipoCanal;

    const termo = f.q?.trim();
    if (termo) {
      const digitos = termo.replace(/\D/g, '');
      where.customer = {
        // `tenantId` também deste lado: sem ele o ILIKE varre os clientes de
        // TODOS os tenants antes do join, jogando fora o recorte do índice.
        tenantId,
        OR: [
          { nome: { contains: termo, mode: 'insensitive' } },
          // Só busca por telefone se houver dígitos: `contains: ''` casa com
          // qualquer telefone preenchido e a busca por nome trazia a base toda.
          ...(digitos ? [{ telefone: { contains: digitos } }] : []),
        ],
      };
    }

    const deDt = parseDateFilter(f.de);
    const ateDt = parseDateFilter(f.ate ? f.ate + 'T23:59:59' : undefined);
    if (deDt || ateDt) {
      where.createdAt = { ...(deDt ? { gte: deDt } : {}), ...(ateDt ? { lte: ateDt } : {}) };
    }
    return where;
  }

  /** Anexa nome de campanha e de régua (não há FK, mapeia em lote). */
  private async mapear(rows: LinhaBanco[], previa: boolean) {
    const campIds = [...new Set(rows.map((r) => r.campaignId).filter(Boolean) as string[])];
    const camps = campIds.length
      ? await this.prisma.campaign.findMany({ where: { id: { in: campIds } }, select: { id: true, nome: true } })
      : [];
    const cmap = new Map(camps.map((c) => [c.id, c.nome]));
    const ruleIds = [...new Set(rows.map((r) => r.ruleId).filter(Boolean) as string[])];
    const rules = ruleIds.length
      ? await this.prisma.dunningRule.findMany({ where: { id: { in: ruleIds } }, select: { id: true, nome: true } })
      : [];
    const rmap = new Map(rules.map((r) => [r.id, r.nome]));

    return rows.map((r) => {
      const texto = r.conteudo ?? null;
      const cortar = previa && !!texto && texto.length > PREVIA;
      return {
        id: r.id,
        canal: r.canal,
        canalNome: r.channelAccount?.apelido ?? null,
        campanha: r.campaignId ? cmap.get(r.campaignId) ?? null : null,
        regua: r.ruleNome ?? (r.ruleId ? rmap.get(r.ruleId) ?? null : null),
        origem: r.campaignId ? 'Campanha' : r.ruleId || r.ruleNome ? 'Cobrança automática' : null,
        conteudo: cortar ? texto!.slice(0, PREVIA) : texto,
        conteudoTruncado: cortar,
        status: r.status,
        erro: r.erro,
        enviadoEm: r.enviadoEm,
        createdAt: r.createdAt,
        cliente: r.customer?.nome ?? null,
        telefone: r.customer?.telefone ?? null,
      };
    });
  }

  /**
   * Histórico paginado por cursor. `comTotal=1` pede também a contagem — o painel
   * só manda quando os filtros mudam, porque o COUNT percorre o filtro inteiro e
   * o resultado é o mesmo em todas as páginas do mesmo recorte.
   */
  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query() query: FiltrosQuery & { cursor?: string; pageSize?: string; comTotal?: string },
  ) {
    const base = this.buildWhere(tenantId, query);
    const take = Math.min(100, Math.max(5, Number(query.pageSize) || 20));

    const cur = decodeCursor(query.cursor);
    const where = cur
      ? {
          ...base,
          AND: [
            {
              OR: [
                { createdAt: { lt: cur.createdAt } },
                { createdAt: cur.createdAt, id: { lt: cur.id } },
              ],
            },
          ],
        }
      : base;

    const [buscadas, total] = await Promise.all([
      this.prisma.messageDispatch.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1, // a linha extra sonda se há próxima página, sem um COUNT a mais
      }),
      query.comTotal === '1' ? this.prisma.messageDispatch.count({ where: base }) : Promise.resolve(undefined),
    ]);

    const temMais = buscadas.length > take;
    const rows = temMais ? buscadas.slice(0, take) : buscadas;
    const ultima = rows[rows.length - 1];

    return {
      rows: await this.mapear(rows, true),
      pageSize: take,
      nextCursor: temMais && ultima ? encodeCursor(ultima) : null,
      total, // ausente quando não foi pedido: o painel mantém o último conhecido
    };
  }

  /**
   * Contagem por status do MESMO recorte da lista, ignorando o filtro de status —
   * os cartões são atalhos de filtro, então precisam mostrar quanto há de cada um
   * dentro do período e dos demais filtros ativos.
   */
  @Get('resumo')
  async resumo(@TenantId() tenantId: string, @Query() query: FiltrosQuery) {
    const { status: _semStatus, ...resto } = query;
    const where = this.buildWhere(tenantId, resto);
    const grupos = await this.prisma.messageDispatch.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const por = (s: string) => grupos.find((g) => g.status === s)?._count._all ?? 0;
    return {
      enviados: por('ENVIADO') + por('ENTREGUE') + por('LIDO'),
      entregues: por('ENTREGUE'),
      falhas: por('FALHA'),
      fila: por('FILA'),
      ignorados: por('IGNORADO'),
      total: grupos.reduce((a, g) => a + g._count._all, 0),
    };
  }

  /** Exporta o filtro atual. É a saída para "preciso ver tudo" sem jogar tudo na tela. */
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="disparos.csv"')
  async exportar(@TenantId() tenantId: string, @Query() query: FiltrosQuery, @Res() res: Response) {
    const base = this.buildWhere(tenantId, query);
    const linhas: Record<string, unknown>[] = [];
    let cur: { createdAt: Date; id: string } | undefined;

    // Em lotes por cursor: uma única query de 20 mil linhas com o texto das
    // mensagens carregaria dezenas de MB de uma vez na memória da API.
    while (linhas.length < EXPORT_MAX) {
      const pedido = Math.min(EXPORT_LOTE, EXPORT_MAX - linhas.length);
      const where = cur
        ? {
            ...base,
            AND: [
              { OR: [{ createdAt: { lt: cur.createdAt } }, { createdAt: cur.createdAt, id: { lt: cur.id } }] },
            ],
          }
        : base;
      const lote = await this.prisma.messageDispatch.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: pedido,
      });
      if (!lote.length) break;

      for (const d of await this.mapear(lote, false)) {
        linhas.push({
          quando: dataBr(d.createdAt),
          cliente: d.cliente ?? '',
          telefone: d.telefone ?? '',
          canal: d.canal,
          canalNome: d.canalNome ?? '',
          origem: d.origem ?? '',
          campanha: d.campanha ?? '',
          regua: d.regua ?? '',
          status: d.status,
          enviadoEm: dataBr(d.enviadoEm),
          erro: d.erro ?? '',
          conteudo: d.conteudo ?? '',
        });
      }
      cur = { createdAt: lote[lote.length - 1].createdAt, id: lote[lote.length - 1].id };
      if (lote.length < pedido) break;
    }

    const csv = toCsv(
      [
        { key: 'quando', label: 'Quando' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'telefone', label: 'Telefone' },
        { key: 'canal', label: 'Canal' },
        { key: 'canalNome', label: 'Conta do canal' },
        { key: 'origem', label: 'Origem' },
        { key: 'campanha', label: 'Campanha' },
        { key: 'regua', label: 'Régua' },
        { key: 'status', label: 'Status' },
        { key: 'enviadoEm', label: 'Enviado em' },
        { key: 'erro', label: 'Erro' },
        { key: 'conteudo', label: 'Mensagem' },
      ],
      linhas,
    );
    res.send('﻿' + csv); // BOM para o Excel abrir com acentos
  }

  /** Mensagem e erro completos de um disparo (a lista manda só o trecho). */
  @Get(':id')
  async detalhe(@TenantId() tenantId: string, @Param('id') id: string) {
    const d = await this.prisma.messageDispatch.findFirst({
      where: { id, tenantId },
      select: { id: true, assunto: true, conteudo: true, erro: true, status: true },
    });
    if (!d) throw new NotFoundException('Disparo não encontrado');
    return d;
  }
}
