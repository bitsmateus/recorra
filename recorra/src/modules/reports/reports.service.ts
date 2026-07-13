import { Injectable } from '@nestjs/common';
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

  /** Funil de recuperação por passo (offset) e por canal. */
  async funnel(tenantId: string) {
    const dispatches = await this.prisma.messageDispatch.findMany({
      where: { tenantId, status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] } },
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

  /** Custo de comunicação vs recuperado (ROI) no mês. */
  async roi(tenantId: string) {
    const inicio = this.inicioMes();
    const porCanal = await this.prisma.messageDispatch.groupBy({
      by: ['canal'],
      where: { tenantId, status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] }, createdAt: { gte: inicio } },
      _count: true,
    });
    const volumes: CanalVolume[] = porCanal.map((c) => ({ canal: c.canal, quantidade: c._count }));
    const custo = custoComunicacao(volumes);

    const recuperadoAgg = await this.prisma.invoice.aggregate({
      where: { tenantId, status: 'PAGA', pagoEm: { gte: inicio } },
      _sum: { valor: true },
    });
    const recuperado = Number(recuperadoAgg._sum.valor ?? 0);

    return { ...computeRoi(custo, recuperado), volumes };
  }

  /** Extrato/repasse por gateway. */
  async extratoPorGateway(tenantId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, provider: { not: null } },
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

  /** Exporta faturas em CSV. */
  async exportInvoicesCsv(tenantId: string): Promise<string> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      include: { customer: { select: { nome: true, doc: true } } },
      orderBy: { vencimento: 'desc' },
      take: 10000,
    });
    return toCsv(
      [
        { key: 'nome', label: 'Cliente' },
        { key: 'doc', label: 'Documento' },
        { key: 'valor', label: 'Valor' },
        { key: 'vencimento', label: 'Vencimento' },
        { key: 'status', label: 'Status' },
        { key: 'origem', label: 'Origem' },
      ],
      invoices.map((i) => ({
        nome: i.customer.nome,
        doc: i.customer.doc,
        valor: Number(i.valor).toFixed(2),
        vencimento: i.vencimento.toISOString().slice(0, 10),
        status: i.status,
        origem: i.origem ?? '',
      })),
    );
  }
}
