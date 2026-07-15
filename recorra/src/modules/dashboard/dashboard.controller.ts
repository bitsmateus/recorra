import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { TenantId } from '@/common/auth/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('resumo')
  async resumo(@TenantId() tenantId: string) {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const [inadimplencia, recuperadoMes, cobrancasAtivas, disparosMes] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'VENCIDA' },
        _sum: { valor: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'PAGA', pagoEm: { gte: inicioMes } },
        _sum: { valor: true },
        _count: true,
      }),
      this.prisma.invoice.count({ where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] } } }),
      this.prisma.messageDispatch.count({ where: { tenantId, createdAt: { gte: inicioMes } } }),
    ]);

    const inadValor = Number(inadimplencia._sum.valor ?? 0);
    const recValor = Number(recuperadoMes._sum.valor ?? 0);
    const taxaRecuperacao = inadValor + recValor > 0 ? recValor / (inadValor + recValor) : 0;

    return {
      inadimplencia: { valor: inadValor, faturas: inadimplencia._count },
      recuperadoMes: { valor: recValor, faturas: recuperadoMes._count },
      cobrancasAtivas,
      disparosMes,
      taxaRecuperacao: Math.round(taxaRecuperacao * 100),
    };
  }

  /** Aging: contas a receber em aberto e vencidas, agrupadas por faixa de dias. */
  @Get('aging')
  async aging(@TenantId() tenantId: string) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const DIA = 86_400_000;

    const faturas = await this.prisma.invoice.findMany({
      where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] } },
      select: { valor: true, vencimento: true, customerId: true, status: true },
    });

    const LABELS_ABERTO = ['Próximos 7d', 'De 8 a 15d', 'De 16 a 30d', 'De 31 a 60d', 'De 61 a 90d', 'Acima de 90d'];
    const LABELS_VENCIDO = ['Últimos 7d', 'De 8 a 15d', 'De 16 a 30d', 'De 31 a 60d', 'De 61 a 90d', 'Acima de 90d'];
    const faixa = (dias: number) => (dias <= 7 ? 0 : dias <= 15 ? 1 : dias <= 30 ? 2 : dias <= 60 ? 3 : dias <= 90 ? 4 : 5);

    const vazio = () => Array.from({ length: 6 }, () => ({ valor: 0, faturas: 0, clientes: new Set<string>() }));
    const aberto = vazio();
    const vencido = vazio();

    for (const f of faturas) {
      const v = Number(f.valor);
      const venc = new Date(f.vencimento);
      venc.setHours(0, 0, 0, 0);
      const alvo = f.status === 'VENCIDA' ? vencido : aberto;
      const dias = Math.max(0, Math.round(Math.abs(venc.getTime() - hoje.getTime()) / DIA));
      const b = alvo[faixa(dias)];
      b.valor += v;
      b.faturas += 1;
      b.clientes.add(f.customerId);
    }

    const montar = (grupo: ReturnType<typeof vazio>, labels: string[]) => {
      const totalValor = grupo.reduce((s, b) => s + b.valor, 0);
      const linhas = grupo.map((b, i) => ({
        periodo: labels[i],
        clientes: b.clientes.size,
        faturas: b.faturas,
        valor: b.valor,
        pct: totalValor > 0 ? Math.round((b.valor / totalValor) * 1000) / 10 : 0,
      }));
      const clientesTotal = new Set<string>();
      grupo.forEach((b) => b.clientes.forEach((c) => clientesTotal.add(c)));
      return {
        total: { clientes: clientesTotal.size, faturas: grupo.reduce((s, b) => s + b.faturas, 0), valor: totalValor, pct: 100 },
        linhas,
      };
    };

    return { emAberto: montar(aberto, LABELS_ABERTO), vencidas: montar(vencido, LABELS_VENCIDO) };
  }

  /** Série dos últimos 6 meses: previsto (por vencimento) x recebido (por pagamento). */
  @Get('serie-mensal')
  async serieMensal(@TenantId() tenantId: string) {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);

    const [previstas, recebidas] = await Promise.all([
      this.prisma.invoice.findMany({ where: { tenantId, vencimento: { gte: inicio } }, select: { valor: true, vencimento: true } }),
      this.prisma.invoice.findMany({ where: { tenantId, status: 'PAGA', pagoEm: { gte: inicio } }, select: { valor: true, pagoEm: true } }),
    ]);

    const chave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const meses: { mes: string; label: string; previsto: number; recebido: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - 5 + i, 1);
      meses.push({ mes: chave(d), label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), previsto: 0, recebido: 0 });
    }
    const idx = new Map(meses.map((m, i) => [m.mes, i] as const));
    for (const p of previstas) { const i = idx.get(chave(new Date(p.vencimento))); if (i !== undefined) meses[i].previsto += Number(p.valor); }
    for (const r of recebidas) { const i = idx.get(chave(new Date(r.pagoEm!))); if (i !== undefined) meses[i].recebido += Number(r.valor); }
    return meses;
  }
}
