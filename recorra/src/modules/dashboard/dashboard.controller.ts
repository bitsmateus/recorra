import { CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Query, UseGuards } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { TenantId } from '@/common/auth/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthUser } from '@/common/auth/jwt.types';
import { somenteProprios, telasEfetivas } from '@/common/auth/telas';
import { intervaloDatas, inicioDoMes, intervaloVencimento, inicioDoMesUtc, chaveMes } from '@/common/util/periodo';

const TIPO_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  SMS: 'SMS',
  HTTP_GENERIC: 'HTTP',
  NX_SYSTEMS: 'NX Systems',
};

const tipoDeCanal = (c: ChannelType) => (c.startsWith('WHATSAPP') ? 'WHATSAPP' : c);

/**
 * Números da empresa toda: operador/leitura (que veem só o que é deles) não
 * acessam — o painel deles é /recuperacao/meu-painel — a não ser que quem
 * administra libere a tela Relatórios para a pessoa.
 */
@Injectable()
class DashboardGeralGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException();
    if (!somenteProprios(user.role)) return true;
    const u = await this.prisma.user.findUnique({ where: { id: user.id }, select: { role: true, telas: true, telasCustom: true } });
    if (u && telasEfetivas(u).includes('relatorios')) return true;
    throw new ForbiddenException('Painel geral restrito — use o seu painel');
  }
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard, DashboardGeralGuard)
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
      // Inadimplência recorta pela data de vencimento: são as cobranças
      // vencidas dentro do período escolhido.
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'VENCIDA', gestaoCobranca: 'ATIVA', vencimento: venc },
        _sum: { valor: true },
        _count: true,
      }),
      // Recuperação é um evento do período. Uma fatura antiga paga neste mês
      // precisa aparecer em "Recuperado no período", por isso o recorte é por
      // pagoEm (no fuso do tenant), e não pelo vencimento original da fatura.
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'PAGA', pagoEm: eventos },
        _sum: { valor: true },
        _count: true,
      }),
      this.prisma.invoice.count({ where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, gestaoCobranca: 'ATIVA', vencimento: venc } }),
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
  /**
   * Disparos e chamados POR OPERADOR no período (a mesma janela do resto do painel).
   *
   * Disparos: quem enviou (manual) ou a responsável pelo cliente (régua/campanha).
   * Chamados (atendimentos): o que a pessoa de fato atendeu — chat do NX (conversa
   * registrada pelo webhook), respostas na caixa de entrada do Recorrai, clientes que
   * responderam e caíram na fila dela, e promessas que ela registrou.
   */
  @Get('operadores')
  async operadores(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    const per = await this.periodo(tenantId, de, ate);
    const gte = per.gte ?? inicioDoMes();
    const lte = per.lte ?? new Date();

    type Linha = { operadorId: string | null; [k: string]: number | string | null };
    const [disparos, recebidos, inbox, promessas, usuarios] = await Promise.all([
      this.prisma.$queryRaw<Linha[]>`
        SELECT CASE WHEN d.origem = 'MANUAL' AND d."userId" IS NOT NULL THEN d."userId" ELSE c."responsavelId" END AS "operadorId",
               count(*) FILTER (WHERE d.origem IN ('REGUA','CAMPANHA') AND d.status IN ('ENVIADO','ENTREGUE','LIDO'))::int AS automaticos,
               count(*) FILTER (WHERE d.origem = 'MANUAL' AND d.template IS DISTINCT FROM 'nx_chat' AND d.status IN ('ENVIADO','ENTREGUE','LIDO'))::int AS manuais,
               count(*) FILTER (WHERE d.origem = 'MANUAL' AND d.template = 'nx_chat')::int AS "chatNx",
               count(*) FILTER (WHERE d.status = 'FALHA')::int AS falhas,
               count(DISTINCT d."customerId") FILTER (WHERE d.status IN ('ENVIADO','ENTREGUE','LIDO'))::int AS clientes
          FROM message_dispatches d JOIN customers c ON c.id = d."customerId"
         WHERE d."tenantId" = ${tenantId} AND d.origem IN ('REGUA','MANUAL','CAMPANHA') AND d.canal <> 'WEBHOOK'
           AND d."createdAt" BETWEEN ${gte} AND ${lte}
         GROUP BY 1`,
      // Cliente respondeu e o atendimento foi para a fila dela (a responsável do cliente).
      this.prisma.$queryRaw<Linha[]>`
        SELECT COALESCE(r."responsavelId", c."responsavelId") AS "operadorId", count(*)::int AS n
          FROM nx_ticket_routes r LEFT JOIN customers c ON c.id = r."customerId"
         WHERE r."tenantId" = ${tenantId} AND r."createdAt" BETWEEN ${gte} AND ${lte}
         GROUP BY 1`,
      // Conversas respondidas por uma pessoa na caixa de entrada do Recorrai.
      this.prisma.$queryRaw<Linha[]>`
        SELECT m.autor AS "operadorId", count(DISTINCT m."conversationId")::int AS n
          FROM inbox_messages m JOIN users u ON u.id = m.autor
         WHERE m."tenantId" = ${tenantId} AND m.direcao = 'OUT' AND m."createdAt" BETWEEN ${gte} AND ${lte}
         GROUP BY 1`,
      this.prisma.customerNote.groupBy({
        by: ['userId'], where: { tenantId, tipo: 'PROMESSA', userId: { not: null }, createdAt: { gte, lte } }, _count: true,
      }),
      this.prisma.user.findMany({
        where: { tenantId, OR: [{ carteiraId: { not: null } }, { role: 'OPERADOR' }] },
        select: { id: true, nome: true, ativo: true, carteira: { select: { nome: true } } },
      }),
    ]);

    const n = (v: unknown) => Number(v ?? 0);
    const por = <T extends { operadorId: string | null }>(l: T[]) => new Map(l.map((x) => [x.operadorId, x]));
    const dD = por(disparos), dR = por(recebidos), dI = por(inbox);
    const dP = new Map(promessas.map((x) => [x.userId, x._count]));
    const nomes = new Map(usuarios.map((u) => [u.id, u]));
    // Quem aparece em qualquer coisa entra na lista (mesmo sem carteira); a equipe aparece zerada.
    const ids = new Set<string | null>([...usuarios.map((u) => u.id), ...dD.keys(), ...dR.keys(), ...dI.keys(), ...dP.keys()]);
    const extras = await this.prisma.user.findMany({
      where: { tenantId, id: { in: [...ids].filter((x): x is string => !!x && !nomes.has(x)) } },
      select: { id: true, nome: true, ativo: true, carteira: { select: { nome: true } } },
    });
    for (const u of extras) nomes.set(u.id, u);

    const linhas = [...ids].map((id) => {
      const u = id ? nomes.get(id) : undefined;
      const d = dD.get(id), r = dR.get(id), i = dI.get(id);
      const automaticos = n(d?.automaticos), manuais = n(d?.manuais), chatNx = n(d?.chatNx);
      return {
        id, nome: u?.nome ?? 'Sem responsável', carteira: u?.carteira?.nome ?? null, ativo: u?.ativo ?? true,
        disparos: { automaticos, manuais, chatNx, total: automaticos + manuais + chatNx, falhas: n(d?.falhas), clientes: n(d?.clientes) },
        chamados: { recebidos: n(r?.n), chatNx, inbox: n(i?.n), promessas: dP.get(id) ?? 0, atendidos: chatNx + n(i?.n) },
      };
    })
      // Quem não tem nada e não é da equipe (carteira) some; a "Sem responsável" só aparece se tiver algo.
      .filter((l) => l.carteira || l.disparos.total + l.disparos.falhas + l.chamados.recebidos + l.chamados.atendidos + l.chamados.promessas > 0)
      .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : 0) || b.disparos.total + b.chamados.atendidos - (a.disparos.total + a.chamados.atendidos) || a.nome.localeCompare(b.nome));

    const soma = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((t, l) => t + f(l), 0);
    return {
      periodo: { de: gte, ate: lte },
      operadores: linhas,
      totais: {
        disparos: { automaticos: soma((l) => l.disparos.automaticos), manuais: soma((l) => l.disparos.manuais), chatNx: soma((l) => l.disparos.chatNx), falhas: soma((l) => l.disparos.falhas) },
        chamados: { recebidos: soma((l) => l.chamados.recebidos), atendidos: soma((l) => l.chamados.atendidos), promessas: soma((l) => l.chamados.promessas) },
      },
    };
  }

  @Get('aging')
  async aging(@TenantId() tenantId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const DIA = 86_400_000;

    // Mesmo recorte por vencimento do resumo: só as cobranças que vencem no período.
    const faturas = await this.prisma.invoice.findMany({
      where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, gestaoCobranca: 'ATIVA', vencimento: this.periodoVencimento(de, ate) },
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
