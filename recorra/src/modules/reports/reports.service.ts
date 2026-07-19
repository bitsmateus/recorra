import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '@/common/prisma/prisma.service';
import { funnelByChannel, funnelByStep, DispatchRow } from './funnel';
import { custoComunicacao, computeRoi, CanalVolume } from './roi';
import { toCsv } from './csv';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private inicioMes(): Date {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Intervalo `de`/`ate` (YYYY-MM-DD) para o where; undefined se ambos vazios/inválidos. */
  private range(de?: string, ate?: string): { gte?: Date; lte?: Date } | undefined {
    const gte = de ? new Date(`${de}T00:00:00.000Z`) : undefined;
    const lte = ate ? new Date(`${ate}T23:59:59.999Z`) : undefined;
    if (gte && Number.isNaN(gte.getTime())) return undefined;
    if (lte && Number.isNaN(lte.getTime())) return undefined;
    if (!gte && !lte) return undefined;
    return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
  }

  /** Funil de recuperação por passo (offset) e por canal. */
  async funnel(tenantId: string, de?: string, ate?: string) {
    const periodo = this.range(de, ate);
    const dispatches = await this.prisma.messageDispatch.findMany({
      where: { tenantId, status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] }, ...(periodo ? { createdAt: periodo } : {}) },
      include: { invoice: { select: { status: true, vencimento: true } } },
      take: 5000,
    });

    const rows: DispatchRow[] = dispatches.map((d) => ({
      canal: d.canal,
      offsetDias: d.invoice ? Math.round((d.createdAt.getTime() - d.invoice.vencimento.getTime()) / 86400000) : 0,
      enviado: true,
      pago: d.invoice?.status === 'PAGA',
    }));

    return { porCanal: funnelByChannel(rows), porPasso: funnelByStep(rows) };
  }

  /** Custo de comunicação vs recuperado (ROI). Sem período, usa o mês corrente. */
  async roi(tenantId: string, de?: string, ate?: string) {
    const periodo = this.range(de, ate) ?? { gte: this.inicioMes() };
    const porCanal = await this.prisma.messageDispatch.groupBy({
      by: ['canal'],
      where: { tenantId, status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] }, createdAt: periodo },
      _count: true,
    });
    const volumes: CanalVolume[] = porCanal.map((c) => ({ canal: c.canal, quantidade: c._count }));
    const custo = custoComunicacao(volumes);

    const recuperadoAgg = await this.prisma.invoice.aggregate({
      where: { tenantId, status: 'PAGA', pagoEm: periodo },
      _sum: { valor: true },
    });
    const recuperado = Number(recuperadoAgg._sum.valor ?? 0);

    return { ...computeRoi(custo, recuperado), volumes };
  }

  /** Recuperado por mês (últimos N meses), por data de pagamento. */
  async recuperacaoMensal(tenantId: string, mesesQ?: string) {
    const n = Math.min(24, Math.max(3, Number(mesesQ) || 6));
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (n - 1), 1);
    const pagas = await this.prisma.invoice.findMany({
      where: { tenantId, status: 'PAGA', pagoEm: { gte: inicio } },
      select: { valor: true, pagoEm: true },
    });
    const chave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const meses: { mes: string; label: string; recebido: number; faturas: number }[] = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - (n - 1) + i, 1);
      meses.push({ mes: chave(d), label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), recebido: 0, faturas: 0 });
    }
    const idx = new Map(meses.map((m, i) => [m.mes, i] as const));
    for (const p of pagas) {
      const i = idx.get(chave(new Date(p.pagoEm!)));
      if (i !== undefined) { meses[i].recebido += Number(p.valor); meses[i].faturas += 1; }
    }
    return meses;
  }

  /** Extrato/repasse por gateway. Período opcional filtra por vencimento. */
  async extratoPorGateway(tenantId: string, de?: string, ate?: string) {
    const periodo = this.range(de, ate);
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, provider: { not: null }, ...(periodo ? { vencimento: periodo } : {}) },
      select: { provider: true, valor: true, status: true, splitConfig: true },
      take: 10000,
    });

    const map = new Map<string, { cobrado: number; pago: number; pendente: number; vencido: number; repassado: number }>();
    for (const inv of invoices) {
      const key = inv.provider as string;
      const cur = map.get(key) ?? { cobrado: 0, pago: 0, pendente: 0, vencido: 0, repassado: 0 };
      const valor = Number(inv.valor);
      cur.cobrado += valor;
      if (inv.status === 'PAGA') cur.pago += valor;
      if (inv.status === 'PENDENTE') cur.pendente += valor;
      if (inv.status === 'VENCIDA') cur.vencido += valor;
      if (Array.isArray(inv.splitConfig)) {
        cur.repassado += (inv.splitConfig as { valor?: number }[]).reduce((s, x) => s + (x.valor ?? 0), 0);
      }
      map.set(key, cur);
    }
    return [...map.entries()].map(([gateway, v]) => ({
      gateway,
      cobrado: Math.round(v.cobrado * 100) / 100,
      pago: Math.round(v.pago * 100) / 100,
      pendente: Math.round(v.pendente * 100) / 100,
      vencido: Math.round(v.vencido * 100) / 100,
      repassado: Math.round(v.repassado * 100) / 100,
    }));
  }

  /** Linhas de fatura para exportação (CSV/Excel), com período opcional por vencimento. */
  private async faturasParaExport(tenantId: string, de?: string, ate?: string) {
    const periodo = this.range(de, ate);
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, ...(periodo ? { vencimento: periodo } : {}) },
      include: { customer: { select: { nome: true, doc: true } } },
      orderBy: { vencimento: 'desc' },
      take: 10000,
    });
    return invoices.map((i) => ({
      Cliente: i.customer.nome,
      Documento: i.customer.doc,
      Valor: Number(i.valor).toFixed(2),
      Vencimento: i.vencimento.toISOString().slice(0, 10),
      Pago_em: i.pagoEm ? i.pagoEm.toISOString().slice(0, 10) : '',
      Status: i.status,
      Origem: i.origem ?? '',
    }));
  }

  /** Exporta faturas em CSV. */
  async exportInvoicesCsv(tenantId: string, de?: string, ate?: string): Promise<string> {
    const linhas = await this.faturasParaExport(tenantId, de, ate);
    return toCsv(
      [
        { key: 'Cliente', label: 'Cliente' },
        { key: 'Documento', label: 'Documento' },
        { key: 'Valor', label: 'Valor' },
        { key: 'Vencimento', label: 'Vencimento' },
        { key: 'Pago_em', label: 'Pago em' },
        { key: 'Status', label: 'Status' },
        { key: 'Origem', label: 'Origem' },
      ],
      linhas,
    );
  }

  /** Exporta faturas em Excel (.xlsx) como base64, no mesmo padrão do modelo de cobranças. */
  async exportInvoicesXlsx(tenantId: string, de?: string, ate?: string) {
    const linhas = await this.faturasParaExport(tenantId, de, ate);
    const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Cliente: '', Documento: '', Valor: '', Vencimento: '', Pago_em: '', Status: '', Origem: '' }]);
    ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'faturas');
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return {
      filename: 'faturas-recorra.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: buf.toString('base64'),
    };
  }
}
