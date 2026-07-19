import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { TenantId } from '@/common/auth/current-user.decorator';
import { ReportsService } from './reports.service';

@Controller('relatorios')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('funil')
  funil(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.reports.funnel(tenantId, de, ate);
  }

  @Get('roi')
  roi(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.reports.roi(tenantId, de, ate);
  }

  @Get('recuperacao-mensal')
  recuperacaoMensal(@TenantId() tenantId: string, @Query('meses') meses?: string) {
    return this.reports.recuperacaoMensal(tenantId, meses);
  }

  @Get('extrato')
  extrato(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.reports.extratoPorGateway(tenantId, de, ate);
  }

  @Get('export/faturas.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="faturas.csv"')
  async exportFaturas(@TenantId() tenantId: string, @Res() res: Response, @Query('de') de?: string, @Query('ate') ate?: string) {
    const csv = await this.reports.exportInvoicesCsv(tenantId, de, ate);
    res.send('﻿' + csv); // BOM para Excel abrir com acentos
  }

  @Get('export/faturas.xlsx')
  exportFaturasXlsx(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.reports.exportInvoicesXlsx(tenantId, de, ate);
  }
}
