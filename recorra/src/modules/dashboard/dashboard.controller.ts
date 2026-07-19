import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { TenantId } from '@/common/auth/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { intervaloDatas, inicioDoMes, intervaloVencimento, inicioDoMesUtc, chaveMes } from '@/common/util/periodo';

const TIPO_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  SMS: 'SMS',
  HTTP_GENERIC: 'HTTP',
  NX_SYSTEMS: 'NX Systems',
};

const tipoDeCanal = (c: ChannelType) => (c.startsWith('WHATSAPP') ? 'WHATSAPP' : c);

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sem `de`/`ate` o período é o mês corrente — o comportamento que o dashboard
   * sempre teve, mantido como padrão para quem abre a tela sem filtrar.
   *
   * As datas vêm do calendário do usuário, então o recorte do dia é resolvido
   * no fuso do tenant e não no do servidor (que roda em UTC).
   */
  private async periodo(tenantId: string, de?: string, ate?: string): Promise<{ gte?: Date; lte?: Date }> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    const fuso = tenant?.timezone ?? undefined;
    return intervaloDatas(de, ate, fuso) ?? { gte: inicioDoMes(new Date(), fuso) };
  }

  /** Recorte por vencimento (data-only, UTC). Padrão: mês corrente. */
  private periodoVencimento(de?: string, ate?: string): { gte?: Date; lte?: Date } {
    return intervaloVencimento(de, ate) ?? { gte: inicioDoMesUtc() };
  }

  @Get('resumo')
  async resumo(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    const venc = this.periodoVencimento(de, ate);
    const eventos = await this.periodo(tenantId, de, ate);

    const [inadimplencia, recuperado, cobrancasAtivas, disparos] = await Promise.all([
      // Faturas recortam pela data de vencimento: são as cobranças "daquele mês".
      // Recuperado = das que vencem no período, quais já foram pagas.
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'VENCIDA', vencimento: venc },
        _sum: { valor: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'PAGA', vencimento: venc },
        _sum: { valor: true },
        _count: true,
      }),
      this.prisma.invoice.count({ where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, vencimento: venc } }),
      // Disparos são eventos, não faturas: filtram por quando saíram (fuso do tenant).
      this.prisma.messageDispatch.count({ where: { tenantId, createdAt: eventos } }),
    ]);

    const inadValor = Number(inadimplencia._sum.valor ?? 0);
    const recValor = Number(recuperado._sum.valor ?? 0);
    const taxaRecuperacao = inadValor + recValor > 0 ? recValor / (inadValor + recValor) : 0;

    return {
      inadimplencia: { valor: inadValor, faturas: inadimplencia._count },
      recuperadoMes: { valor: recValor, faturas: recuperado._count },
      cobrancasAtivas,
      disparosMes: disparos,
      taxaRecuperacao: Math.round(taxaRecuperacao * 100),
    };
  }

  /**
   * Resumo dos disparos por canal no período: volume, entrega e custo.
   *
   * `ENTREGUE` e `LIDO` já passaram por `ENVIADO`, então contam como enviados
   * também — senão uma mensagem lida sumiria do total de saídas.
   */
  @Get('disparos-canais')
  async disparosCanais(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    const grupos = await this.prisma.messageDispatch.groupBy({
      by: ['canal', 'status'],
      where: { tenantId, createdAt: await this.periodo(tenantId, de, ate) },
      _count: { _all: true },
      _sum: { custo: true },
    });

    const vazio = () => ({ disparos: 0, enviados: 0, entregues: 0, lidos: 0, falhas: 0, fila: 0, ignorados: 0, custo: 0 });
    const porCanal = new Map<string, ReturnType<typeof vazio>>();

    for (const g of grupos) {
      const tipo = tipoDeCanal(g.canal);
      const c = porCanal.get(tipo) ?? vazio();
      const n = g._count._all;

      c.disparos += n;
      c.custo += Number(g._sum.custo ?? 0);
      if (g.status === 'ENVIADO' || g.status === 'ENTREGUE' || g.status === 'LIDO') c.enviados += n;
      if (g.status === 'ENTREGUE' || g.status === 'LIDO') c.entregues += n;
      if (g.status === 'LIDO') c.lidos += n;
      if (g.status === 'FALHA') c.falhas += n;
      if (g.status === 'FILA') c.fila += n;
      if (g.status === 'IGNORADO') c.ignorados += n;

      porCanal.set(tipo, c);
    }

    const totalDisparos = [...porCanal.values()].reduce((s, c) => s + c.disparos, 0);
    const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 1000) / 10 : 0);

    const canais = [...porCanal.entries()]
      .map(([canal, c]) => ({
        canal,
        label: TIPO_LABEL[canal] ?? canal,
        ...c,
        custo: Math.round(c.custo * 10000) / 10000,
        taxaEntrega: pct(c.entregues, c.enviados),
        taxaFalha: pct(c.falhas, c.enviados + c.falhas),
        pct: pct(c.disparos, totalDisparos),
      }))
      .sort((a, b) => b.disparos - a.disparos);

    const soma = (k: 'enviados' | 'entregues' | 'lidos' | 'falhas' | 'fila' | 'ignorados' | 'custo') =>
      canais.reduce((s, c) => s + c[k], 0);

    return {
      total: {
        disparos: totalDisparos,
        enviados: soma('enviados'),
        entregues: soma('entregues'),
        lidos: soma('lidos'),
        falhas: soma('falhas'),
        fila: soma('fila'),
        ignorados: soma('ignorados'),
        custo: Math.round(soma('custo') * 10000) / 10000,
        taxaEntrega: pct(soma('entregues'), soma('enviados')),
      },
      canais,
    };
  }

  /** Aging: contas a receber em aberto e vencidas, agrupadas por faixa de dias. */
  @Get('aging')
  async aging(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const DIA = 86_400_000;

    // Mesmo recorte por vencimento do resumo: só as cobranças que vencem no período.
    const faturas = await this.prisma.invoice.findMany({
      where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, vencimento: this.periodoVencimento(de, ate) },
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

  /** Série mensal: previsto (por vencimento) x recebido (por pagamento). */
  @Get('serie-mensal')
  async serieMensal(@TenantId() tenantId: string, @Query('meses') mesesQ?: string) {
    const n = Math.min(24, Math.max(3, Number(mesesQ) || 6));
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (n - 1), 1);

    const [previstas, recebidas] = await Promise.all([
      this.prisma.invoice.findMany({ where: { tenantId, vencimento: { gte: inicio } }, select: { valor: true, vencimento: true } }),
      this.prisma.invoice.findMany({ where: { tenantId, status: 'PAGA', pagoEm: { gte: inicio } }, select: { valor: true, pagoEm: true } }),
    ]);

    const meses: { mes: string; label: string; previsto: number; recebido: number }[] = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - (n - 1) + i, 1);
      // Passando de 12 meses o nome do mês se repete ("jul" duas vezes), então
      // o ano entra no rótulo para o eixo não ficar ambíguo.
      const mesCurto = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      const label = n > 12 ? `${mesCurto}/${String(d.getFullYear()).slice(2)}` : mesCurto;
      meses.push({ mes: chaveMes(d), label, previsto: 0, recebido: 0 });
    }
    const idx = new Map(meses.map((m, i) => [m.mes, i] as const));
    for (const p of previstas) { const i = idx.get(chaveMes(new Date(p.vencimento))); if (i !== undefined) meses[i].previsto += Number(p.valor); }
    for (const r of recebidas) { const i = idx.get(chaveMes(new Date(r.pagoEm!))); if (i !== undefined) meses[i].recebido += Number(r.valor); }
    return meses;
  }
}
