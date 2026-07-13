import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { TenantId } from '@/common/auth/current-user.decorator';
import { ReportsService } from './reports.service';

@Controller('relatorios')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('funil')
  funil(@TenantId() tenantId: string) {
    return this.reports.funnel(tenantId);
  }

  @Get('roi')
  roi(@TenantId() tenantId: string) {
    return this.reports.roi(tenantId);
  }

  @Get('extrato')
  extrato(@TenantId() tenantId: string) {
    return this.reports.extratoPorGateway(tenantId);
  }

  @Get('export/faturas.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="faturas.csv"')
  async exportFaturas(@TenantId() tenantId: string, @Res() res: Response) {
    const csv = await this.reports.exportInvoicesCsv(tenantId);
    res.send('﻿' + csv); // BOM para Excel abrir com acentos
  }
}
