import { BadRequestException, Body, Controller, Get, Header, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { CurrentUser, TenantId } from '@/common/auth/current-user.decorator';
import { AuthUser } from '@/common/auth/jwt.types';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RelatorioRecuperacaoService } from './relatorio.service';
import { AtribuicaoService } from './atribuicao.service';
import { DistribuicaoService } from './distribuicao.service';

/**
 * Recuperação por origem/operador e distribuição automática. Relatório é dado
 * financeiro e de remuneração variável: só quem administra vê (não operador).
 */
@Controller('recuperacao')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecuperacaoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relatorios: RelatorioRecuperacaoService,
    private readonly atribuicao: AtribuicaoService,
    private readonly distribuicao: DistribuicaoService,
  ) {}

  @Get('relatorio')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  relatorio(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.relatorios.relatorio(tenantId, de, ate);
  }

  @Get('relatorio/export.csv')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="recuperacao.csv"')
  async exportCsv(@TenantId() tenantId: string, @Res() res: Response, @Query('de') de?: string, @Query('ate') ate?: string) {
    res.send('﻿' + (await this.relatorios.exportCsv(tenantId, de, ate)));
  }

  @Get('relatorio/export.xlsx')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  exportXlsx(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.relatorios.exportXlsx(tenantId, de, ate);
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

  /** "Distribuir agora": divide os vencidos sem dono entre os operadores das carteiras automáticas. */
  @Post('distribuir')
  @Roles('OWNER', 'ADMIN')
  distribuir(@TenantId() tenantId: string, @CurrentUser() user: AuthUser) {
    return this.distribuicao.distribuirTenant(tenantId, user.id);
  }
}
