import { BadRequestException, Body, Controller, Get, Header, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { RequerTela, TelaGuard } from '@/common/auth/tela.guard';
import { CurrentUser, TenantId } from '@/common/auth/current-user.decorator';
import { AuthUser } from '@/common/auth/jwt.types';
import { PrismaService } from '@/common/prisma/prisma.service';
import { inicioDoMes } from '@/common/util/periodo';
import { RelatorioRecuperacaoService } from './relatorio.service';
import { AtribuicaoService } from './atribuicao.service';
import { DistribuicaoService } from './distribuicao.service';

/**
 * Recuperação por origem/operador e distribuição automática. Relatório é dado
 * financeiro e de remuneração variável: só quem administra vê (não operador).
 */
@Controller('recuperacao')
@UseGuards(JwtAuthGuard, RolesGuard, TelaGuard)
export class RecuperacaoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relatorios: RelatorioRecuperacaoService,
    private readonly atribuicao: AtribuicaoService,
    private readonly distribuicao: DistribuicaoService,
  ) {}

  @Get('relatorio')
  @RequerTela('relatorios')
  relatorio(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.relatorios.relatorio(tenantId, de, ate);
  }

  /** Quem está por trás de um número da tabela "Por operadora" (clique na célula). */
  @Get('relatorio/operador/:id/detalhe')
  @RequerTela('relatorios')
  detalheOperador(@TenantId() tenantId: string, @Param('id') id: string, @Query('tipo') tipo: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.relatorios.detalheOperador(tenantId, id, tipo, de, ate);
  }

  /** Resumo dia a dia (todas ou uma operadora: ?operador=<id>|sem). */
  @Get('relatorio/diario')
  @RequerTela('relatorios')
  resumoDiario(@TenantId() tenantId: string, @Query('operador') operador?: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.relatorios.resumoDiario(tenantId, de, ate, operador);
  }

  @Get('relatorio/export.csv')
  @RequerTela('relatorios')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="recuperacao.csv"')
  async exportCsv(@TenantId() tenantId: string, @Res() res: Response, @Query('de') de?: string, @Query('ate') ate?: string) {
    res.send('﻿' + (await this.relatorios.exportCsv(tenantId, de, ate)));
  }

  @Get('relatorio/export.xlsx')
  @RequerTela('relatorios')
  exportXlsx(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.relatorios.exportXlsx(tenantId, de, ate);
  }

  /**
   * "Meu painel": só os números da própria pessoa — clientes sob sua
   * responsabilidade, o que está vencido com eles, o que ela recuperou no mês
   * (crédito dela), contatos manuais e promessas. É o Dashboard do operador.
   */
  @Get('meu-painel')
  async meuPainel(@TenantId() tenantId: string, @CurrentUser() user: AuthUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } });
    const inicio = inicioDoMes(new Date(), t.timezone);
    const n = new Date();
    const hoje = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
    const meus = { tenantId, responsavelId: user.id, ativo: true };
    const [clientes, comVencida, aberto, recuperado, manuais, promessas, quebradas, atrasados] = await Promise.all([
      this.prisma.customer.count({ where: meus }),
      this.prisma.customer.count({ where: { ...meus, invoices: { some: { status: 'VENCIDA', gestaoCobranca: 'ATIVA' } } } }),
      this.prisma.invoice.aggregate({ where: { tenantId, status: 'VENCIDA', gestaoCobranca: 'ATIVA', customer: meus }, _sum: { valor: true }, _count: true }),
      this.prisma.invoice.groupBy({
        by: ['recuperadoOrigem'],
        where: { tenantId, status: 'PAGA', recuperadoPorId: user.id, pagoEm: { gte: inicio } },
        _sum: { valor: true }, _count: true,
      }),
      this.prisma.messageDispatch.count({ where: { tenantId, userId: user.id, origem: 'MANUAL', createdAt: { gte: inicio }, status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] } } }),
      this.prisma.customer.findMany({ where: { ...meus, promessaAte: { gte: hoje } }, orderBy: { promessaAte: 'asc' }, take: 10, select: { id: true, nome: true, promessaAte: true } }),
      this.prisma.customer.findMany({
        where: { ...meus, promessaAte: { lt: hoje, gte: new Date(hoje.getTime() - 7 * 86400000) }, invoices: { some: { status: 'VENCIDA' } } },
        orderBy: { promessaAte: 'desc' }, take: 10, select: { id: true, nome: true, promessaAte: true },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId, status: 'VENCIDA', gestaoCobranca: 'ATIVA', customer: meus },
        orderBy: { vencimento: 'asc' }, take: 8,
        select: { id: true, valor: true, vencimento: true, customer: { select: { id: true, nome: true } } },
      }),
    ]);
    const soma = (o: string) => recuperado.find((r) => r.recuperadoOrigem === o);
    const val = (o: string) => Number(soma(o)?._sum.valor ?? 0);
    const qtd = (o: string) => soma(o)?._count ?? 0;
    return {
      mesDesde: inicio,
      clientes, clientesComVencida: comVencida,
      vencidoEmAberto: { valor: Number(aberto._sum.valor ?? 0), faturas: aberto._count },
      recuperadoNoMes: {
        regua: { valor: val('REGUA') + val('CAMPANHA'), faturas: qtd('REGUA') + qtd('CAMPANHA') },
        manual: { valor: val('MANUAL'), faturas: qtd('MANUAL') },
        semContato: { valor: val('SEM_CONTATO'), faturas: qtd('SEM_CONTATO') },
      },
      contatosManuaisNoMes: manuais,
      promessasEmVigor: promessas,
      promessasNaoCumpridas: quebradas,
      maisAtrasados: atrasados.map((i) => ({ invoiceId: i.id, customerId: i.customer.id, nome: i.customer.nome, valor: Number(i.valor), vencimento: i.vencimento })),
    };
  }

  @Get('config')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  async config(@TenantId() tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { janelaAtribuicaoDias: true } });
    return { janelaAtribuicaoDias: t.janelaAtribuicaoDias };
  }

  /** Muda a janela de atribuição e recalcula as faturas pagas com a regra nova. */
  @Put('config')
  @Roles('OWNER', 'ADMIN')
  async setConfig(@TenantId() tenantId: string, @Body('janelaAtribuicaoDias') janela?: number) {
    const n = Number(janela);
    if (!Number.isInteger(n) || n < 1 || n > 60) throw new BadRequestException('A janela deve ser de 1 a 60 dias.');
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { janelaAtribuicaoDias: n } });
    const recalculadas = await this.atribuicao.recalcularTenant(tenantId);
    return { janelaAtribuicaoDias: n, recalculadas };
  }

  /** Atribui agora as faturas pagas ainda pendentes (o worker faz isso a cada 10 min). */
  @Post('atribuir')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  async atribuir(@TenantId() tenantId: string) {
    return { atribuidas: await this.atribuicao.processar(tenantId, 100) };
  }

  /**
   * "Distribuir agora": encaixa os vencidos sem dono. Em carteiras em BLOCOS que já
   * foram divididas hoje, só os novos — `refazer: true` divide a lista inteira de
   * novo (os clientes podem trocar de operadora).
   */
  @Post('distribuir')
  @Roles('OWNER', 'ADMIN')
  distribuir(@TenantId() tenantId: string, @CurrentUser() user: AuthUser, @Body('refazer') refazer?: boolean) {
    return this.distribuicao.distribuirTenant(tenantId, user.id, new Date(), refazer === true);
  }
}
