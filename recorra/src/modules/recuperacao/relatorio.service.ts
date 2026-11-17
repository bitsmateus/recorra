import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '@/common/prisma/prisma.service';
import { inicioDoMes, intervaloDatas } from '@/common/util/periodo';
import { toCsv } from '@/modules/reports/csv';
import { montarRelatorio, nomeCanal, LinhaDisparo, LinhaRecuperado, Relatorio } from './relatorio';

const MAX_DETALHE = 20_000;

/**
 * Relatório "Disparos × Recuperado": quanto a régua disparou, quanto cada
 * operadora contatou manualmente e quanto foi recuperado — separado por origem
 * do último contato (automático/manual), por operadora responsável, carteira,
 * canal e número. Fonte: `MessageDispatch.origem/userId` + atribuição da fatura.
 */
@Injectable()
export class RelatorioRecuperacaoService {
  constructor(private readonly prisma: PrismaService) {}

  private async periodo(tenantId: string, de?: string, ate?: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true, janelaAtribuicaoDias: true } });
    const r = intervaloDatas(de, ate, t.timezone) ?? {};
    return {
      gte: r.gte ?? inicioDoMes(new Date(), t.timezone),
      lte: r.lte ?? new Date(),
      timezone: t.timezone,
      janela: t.janelaAtribuicaoDias,
    };
  }

  async relatorio(tenantId: string, de?: string, ate?: string): Promise<Relatorio & { origensAtendimento: { origem: string; faturas: number; valor: number }[] }> {
    const p = await this.periodo(tenantId, de, ate);

    const [disparos, contatadosPorOp, contatadosTotal, recuperados, usuarios, carteiras, contas, pendentes, clientesPorOp] = await Promise.all([
      // Disparos com sucesso no período. Manual conta para quem enviou; automático
      // e campanha contam para a responsável pelo cliente (a "carteira" dela).
      this.prisma.$queryRaw<LinhaDisparo[]>`
        SELECT d.origem::text AS origem, d.canal::text AS canal, d."channelAccountId" AS "contaId",
               CASE WHEN d.origem = 'MANUAL' AND d."userId" IS NOT NULL THEN d."userId" ELSE c."responsavelId" END AS "operadorId",
               count(*)::int AS n
          FROM message_dispatches d JOIN customers c ON c.id = d."customerId"
         WHERE d."tenantId" = ${tenantId}
           AND d.status IN ('ENVIADO','ENTREGUE','LIDO')
           AND d.origem IN ('REGUA','MANUAL','CAMPANHA') AND d.canal <> 'WEBHOOK'
           AND d."createdAt" BETWEEN ${p.gte} AND ${p.lte}
         GROUP BY 1,2,3,4`,
      this.prisma.$queryRaw<{ operadorId: string | null; n: number }[]>`
        SELECT CASE WHEN d.origem = 'MANUAL' AND d."userId" IS NOT NULL THEN d."userId" ELSE c."responsavelId" END AS "operadorId",
               count(DISTINCT d."customerId")::int AS n
          FROM message_dispatches d JOIN customers c ON c.id = d."customerId"
         WHERE d."tenantId" = ${tenantId}
           AND d.status IN ('ENVIADO','ENTREGUE','LIDO')
           AND d.origem IN ('REGUA','MANUAL','CAMPANHA') AND d.canal <> 'WEBHOOK'
           AND d."createdAt" BETWEEN ${p.gte} AND ${p.lte}
         GROUP BY 1`,
      this.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(DISTINCT d."customerId")::int AS n
          FROM message_dispatches d
         WHERE d."tenantId" = ${tenantId}
           AND d.status IN ('ENVIADO','ENTREGUE','LIDO')
           AND d.origem IN ('REGUA','MANUAL','CAMPANHA') AND d.canal <> 'WEBHOOK'
           AND d."createdAt" BETWEEN ${p.gte} AND ${p.lte}`,
      // Faturas pagas no período, com a atribuição e o canal/conta do último contato.
      this.prisma.$queryRaw<LinhaRecuperado[]>`
        SELECT i."recuperadoOrigem"::text AS origem, i."recuperadoPorId" AS "operadorId",
               i."recuperadoCarteira" AS carteira, d.canal::text AS canal, d."channelAccountId" AS "contaId",
               to_char(i."pagoEm" AT TIME ZONE ${p.timezone}, 'YYYY-MM-DD') AS dia,
               count(*)::int AS n, coalesce(sum(i.valor), 0)::float AS valor
          FROM invoices i LEFT JOIN message_dispatches d ON d.id = i."recuperadoDispatchId"
         WHERE i."tenantId" = ${tenantId} AND i.status = 'PAGA' AND i."atribuidoEm" IS NOT NULL
           AND i."pagoEm" BETWEEN ${p.gte} AND ${p.lte}
         GROUP BY 1,2,3,4,5,6`,
      this.prisma.user.findMany({ where: { tenantId }, select: { id: true, nome: true, role: true, ativo: true, carteira: { select: { nome: true } } } }),
      this.prisma.carteira.findMany({ where: { tenantId }, orderBy: { diaMinimo: 'asc' }, select: { nome: true, diaMinimo: true } }),
      this.prisma.channelAccount.findMany({ where: { tenantId }, select: { id: true, canal: true, apelido: true, numero: true } }),
      this.prisma.invoice.count({ where: { tenantId, status: 'PAGA', atribuidoEm: null, pagoEm: { gte: p.gte, lte: p.lte } } }),
      // Carteira atual de cada operadora: clientes com fatura vencida sob responsabilidade dela.
      this.prisma.$queryRaw<{ operadorId: string; n: number }[]>`
        SELECT c."responsavelId" AS "operadorId", count(DISTINCT c.id)::int AS n
          FROM customers c JOIN invoices i ON i."customerId" = c.id
         WHERE c."tenantId" = ${tenantId} AND c."responsavelId" IS NOT NULL AND c.ativo
           AND i.status IN ('PENDENTE','VENCIDA') AND i."gestaoCobranca" = 'ATIVA'
           AND i.vencimento < ${new Date()}
         GROUP BY 1`,
    ]);

    const origensAtendimento = await this.prisma.$queryRaw<{ origem: string; faturas: number; valor: number }[]>`
      SELECT i."origemAtendimento" AS origem, count(*)::int AS faturas, coalesce(sum(i.valor), 0)::float AS valor
        FROM invoices i
       WHERE i."tenantId" = ${tenantId} AND i.status = 'PAGA' AND i."origemAtendimento" IS NOT NULL AND i."pagoEm" BETWEEN ${p.gte} AND ${p.lte}
       GROUP BY 1 ORDER BY valor DESC`;
    const base = montarRelatorio({
      de: p.gte, ate: p.lte, janelaDias: p.janela,
      disparos, contatadosPorOp, contatadosTotal: contatadosTotal[0]?.n ?? 0, recuperados,
      usuarios: usuarios.map((u) => ({ id: u.id, nome: u.nome, role: u.role, ativo: u.ativo, carteira: u.carteira?.nome ?? null })),
      carteiras: carteiras.map((c) => c.nome),
      contas, pendentesAtribuicao: pendentes,
      clientesPorOp,
    });
    return { ...base, origensAtendimento };
  }

  /**
   * Quem está por trás de cada número da tabela "Por operadora": a lista de clientes/faturas/envios
   * de UMA operadora (ou "sem" = sem responsável) para o tipo de número clicado.
   * Mesmas regras do relatório: manual conta para quem enviou; régua/campanha, para a responsável.
   */
  async detalheOperador(tenantId: string, operador: string, tipo: string, de?: string, ate?: string) {
    const p = await this.periodo(tenantId, de, ate);
    const semOp = operador === 'sem';
    const opId = semOp ? null : operador;
    const fmt = (d?: Date | null) => (d ? d.toLocaleString('pt-BR', { timeZone: p.timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
    const fmtDia = (d?: Date | null) => (d ? d.toLocaleDateString('pt-BR', { timeZone: p.timezone }) : '');
    const venc = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    type Linha = { customerId: string; cliente: string; telefone: string | null; fatura?: string; contrato?: string | null; canal?: string; quando?: string; origem?: string; valor?: number; detalhe?: string; extra?: string };
    let titulo = '';
    let linhas: Linha[] = [];

    if (tipo === 'manuais' || tipo === 'automaticos') {
      const manual = tipo === 'manuais';
      titulo = manual ? 'Contatos manuais enviados por esta pessoa' : 'Disparos automáticos para os clientes desta pessoa';
      const rows = await this.prisma.$queryRaw<{ customerId: string; nome: string; telefone: string | null; contrato: string | null; fatura: string | null; canal: string; quando: Date; status: string; conteudo: string; regua: string | null }[]>`
        SELECT d."customerId", c.nome, c.telefone, c.contrato, coalesce(i."sourceExternalId", i."externalId") AS fatura, d.canal::text AS canal, coalesce(d."enviadoEm", d."createdAt") AS quando,
               d.status::text AS status, left(coalesce(d.conteudo, ''), 140) AS conteudo, d."ruleNome" AS regua
          FROM message_dispatches d JOIN customers c ON c.id = d."customerId" LEFT JOIN invoices i ON i.id = d."invoiceId"
         WHERE d."tenantId" = ${tenantId} AND d.status IN ('ENVIADO','ENTREGUE','LIDO') AND d.canal <> 'WEBHOOK'
           AND d."createdAt" BETWEEN ${p.gte} AND ${p.lte}
           AND (${manual} = (d.origem = 'MANUAL'))
           AND (${manual} OR d.origem IN ('REGUA','CAMPANHA'))
           AND (CASE WHEN ${manual} AND d."userId" IS NOT NULL THEN d."userId" ELSE c."responsavelId" END) IS NOT DISTINCT FROM ${opId}
         ORDER BY quando DESC LIMIT 1000`;
      linhas = rows.map((r) => ({ customerId: r.customerId, cliente: r.nome, telefone: r.telefone, fatura: r.fatura ?? undefined, contrato: r.contrato, canal: nomeCanal(r.canal), quando: fmt(r.quando), origem: manual ? 'Manual' : 'Régua', detalhe: r.conteudo || r.regua || '' }));
    } else if (tipo === 'contatados') {
      titulo = 'Clientes contatados (régua ou manual) no período';
      const rows = await this.prisma.$queryRaw<{ customerId: string; nome: string; telefone: string | null; contrato: string | null; n: number; manuais: number; ultimo: Date }[]>`
        SELECT d."customerId", c.nome, c.telefone, c.contrato, count(*)::int AS n, count(*) FILTER (WHERE d.origem = 'MANUAL')::int AS manuais,
               max(coalesce(d."enviadoEm", d."createdAt")) AS ultimo
          FROM message_dispatches d JOIN customers c ON c.id = d."customerId"
         WHERE d."tenantId" = ${tenantId} AND d.status IN ('ENVIADO','ENTREGUE','LIDO') AND d.canal <> 'WEBHOOK'
           AND d.origem IN ('REGUA','MANUAL','CAMPANHA') AND d."createdAt" BETWEEN ${p.gte} AND ${p.lte}
           AND (CASE WHEN d.origem = 'MANUAL' AND d."userId" IS NOT NULL THEN d."userId" ELSE c."responsavelId" END) IS NOT DISTINCT FROM ${opId}
         GROUP BY 1,2,3,4 ORDER BY ultimo DESC LIMIT 1000`;
      linhas = rows.map((r) => ({ customerId: r.customerId, cliente: r.nome, telefone: r.telefone, contrato: r.contrato, quando: fmt(r.ultimo), detalhe: `${r.n} mensagem(ns) · ${r.manuais} manual(is)` }));
    } else if (tipo === 'clientes') {
      titulo = 'Clientes vencidos sob responsabilidade desta pessoa';
      const rows = await this.prisma.$queryRaw<{ customerId: string; nome: string; telefone: string | null; contrato: string | null; numeros: string | null; faturas: number; valor: number; venc: Date }[]>`
        SELECT c.id AS "customerId", c.nome, c.telefone, c.contrato, string_agg(DISTINCT coalesce(i."sourceExternalId", i."externalId"), ', ') AS numeros, count(*)::int AS faturas, coalesce(sum(i.valor), 0)::float AS valor, min(i.vencimento) AS venc
          FROM customers c JOIN invoices i ON i."customerId" = c.id
         WHERE c."tenantId" = ${tenantId} AND c.ativo AND c."responsavelId" IS NOT DISTINCT FROM ${opId}
           AND i.status IN ('PENDENTE','VENCIDA') AND i."gestaoCobranca" = 'ATIVA' AND i.vencimento < ${new Date()}
         GROUP BY 1,2,3,4 ORDER BY venc ASC LIMIT 1000`;
      const hoje = Date.now();
      linhas = rows.map((r) => ({ customerId: r.customerId, cliente: r.nome, telefone: r.telefone, fatura: r.numeros ?? undefined, contrato: r.contrato, valor: r.valor, quando: `venc. ${venc(r.venc)}`, detalhe: `${r.faturas} fatura(s) · ${Math.max(0, Math.round((hoje - r.venc.getTime()) / 86400000))} dias de atraso` }));
    } else if (['recuperado-regua', 'recuperado-manual', 'recuperado-total', 'sem-contato'].includes(tipo)) {
      const origens = tipo === 'recuperado-regua' ? ['REGUA', 'CAMPANHA'] : tipo === 'recuperado-manual' ? ['MANUAL'] : tipo === 'sem-contato' ? ['SEM_CONTATO'] : ['REGUA', 'CAMPANHA', 'MANUAL'];
      titulo = { 'recuperado-regua': 'Faturas recuperadas pela régua', 'recuperado-manual': 'Faturas recuperadas no manual', 'recuperado-total': 'Todas as faturas recuperadas (régua + manual)', 'sem-contato': 'Faturas pagas sem contato' }[tipo]!;
      const rows = await this.prisma.invoice.findMany({
        where: { tenantId, status: 'PAGA', atribuidoEm: { not: null }, pagoEm: { gte: p.gte, lte: p.lte }, recuperadoPorId: opId, recuperadoOrigem: { in: origens as never[] } },
        orderBy: { pagoEm: 'desc' }, take: 1000,
        select: { valor: true, vencimento: true, pagoEm: true, recuperadoOrigem: true, sourceExternalId: true, externalId: true, origemAtendimento: true, customer: { select: { id: true, nome: true, telefone: true, contrato: true } } },
      });
      linhas = rows.map((r) => ({ customerId: r.customer.id, cliente: r.customer.nome, telefone: r.customer.telefone, fatura: r.sourceExternalId ?? r.externalId ?? undefined, contrato: r.customer.contrato, valor: Number(r.valor), quando: `pago ${fmtDia(r.pagoEm)}`, origem: ROTULO_ORIGEM[r.recuperadoOrigem ?? 'SEM_CONTATO'], detalhe: `venc. ${venc(r.vencimento)}${r.origemAtendimento ? ` · origem: ${r.origemAtendimento}` : ''}` }));
    } else {
      throw new BadRequestException('Tipo de detalhe inválido');
    }
    return { titulo, tipo, total: linhas.length, limitado: linhas.length >= 1000, linhas };
  }

  /** Resumo dia a dia (uma operadora ou todas): disparos, contatados, promessas e recuperado. */
  async resumoDiario(tenantId: string, de?: string, ate?: string, operador?: string) {
    const p = await this.periodo(tenantId, de, ate);
    const filtrar = !!operador && operador !== 'todos';
    const opId = operador === 'sem' ? null : operador ?? null;
    const [disp, rec, prom] = await Promise.all([
      this.prisma.$queryRaw<{ dia: string; auto: number; manual: number; contatados: number }[]>`
        SELECT to_char(d."createdAt" AT TIME ZONE ${p.timezone}, 'YYYY-MM-DD') AS dia,
               count(*) FILTER (WHERE d.origem IN ('REGUA','CAMPANHA'))::int AS auto,
               count(*) FILTER (WHERE d.origem = 'MANUAL')::int AS manual,
               count(DISTINCT d."customerId")::int AS contatados
          FROM message_dispatches d JOIN customers c ON c.id = d."customerId"
         WHERE d."tenantId" = ${tenantId} AND d.status IN ('ENVIADO','ENTREGUE','LIDO') AND d.canal <> 'WEBHOOK'
           AND d.origem IN ('REGUA','MANUAL','CAMPANHA') AND d."createdAt" BETWEEN ${p.gte} AND ${p.lte}
           AND (${!filtrar} OR (CASE WHEN d.origem = 'MANUAL' AND d."userId" IS NOT NULL THEN d."userId" ELSE c."responsavelId" END) IS NOT DISTINCT FROM ${opId})
         GROUP BY 1`,
      this.prisma.$queryRaw<{ dia: string; valorRegua: number; faturasRegua: number; valorManual: number; faturasManual: number }[]>`
        SELECT to_char(i."pagoEm" AT TIME ZONE ${p.timezone}, 'YYYY-MM-DD') AS dia,
               coalesce(sum(i.valor) FILTER (WHERE i."recuperadoOrigem" IN ('REGUA','CAMPANHA')), 0)::float AS "valorRegua",
               (count(*) FILTER (WHERE i."recuperadoOrigem" IN ('REGUA','CAMPANHA')))::int AS "faturasRegua",
               coalesce(sum(i.valor) FILTER (WHERE i."recuperadoOrigem" = 'MANUAL'), 0)::float AS "valorManual",
               (count(*) FILTER (WHERE i."recuperadoOrigem" = 'MANUAL'))::int AS "faturasManual"
          FROM invoices i
         WHERE i."tenantId" = ${tenantId} AND i.status = 'PAGA' AND i."atribuidoEm" IS NOT NULL
           AND i."pagoEm" BETWEEN ${p.gte} AND ${p.lte} AND i."recuperadoOrigem" IN ('REGUA','CAMPANHA','MANUAL')
           AND (${!filtrar} OR i."recuperadoPorId" IS NOT DISTINCT FROM ${opId})
         GROUP BY 1`,
      this.prisma.$queryRaw<{ dia: string; promessas: number; valor: number }[]>`
        SELECT to_char(n."createdAt" AT TIME ZONE ${p.timezone}, 'YYYY-MM-DD') AS dia, count(*)::int AS promessas,
               coalesce(sum(n."valorPrometido"), 0)::float AS valor
          FROM customer_notes n
         WHERE n."tenantId" = ${tenantId} AND n.tipo = 'PROMESSA' AND n."createdAt" BETWEEN ${p.gte} AND ${p.lte}
           AND (${!filtrar} OR n."userId" IS NOT DISTINCT FROM ${opId})
         GROUP BY 1`,
    ]);
    const dias = new Map<string, { dia: string; automaticos: number; manuais: number; contatados: number; promessas: number; valorPrometido: number; recuperadoRegua: number; faturasRegua: number; recuperadoManual: number; faturasManual: number }>();
    const get = (dia: string) => { let d = dias.get(dia); if (!d) { d = { dia, automaticos: 0, manuais: 0, contatados: 0, promessas: 0, valorPrometido: 0, recuperadoRegua: 0, faturasRegua: 0, recuperadoManual: 0, faturasManual: 0 }; dias.set(dia, d); } return d; };
    for (const r of disp) { const d = get(r.dia); d.automaticos = r.auto; d.manuais = r.manual; d.contatados = r.contatados; }
    for (const r of rec) { const d = get(r.dia); d.recuperadoRegua = r.valorRegua; d.faturasRegua = r.faturasRegua; d.recuperadoManual = r.valorManual; d.faturasManual = r.faturasManual; }
    for (const r of prom) { const d = get(r.dia); d.promessas = r.promessas; d.valorPrometido = r.valor; }
    return { dias: [...dias.values()].sort((a, b) => b.dia.localeCompare(a.dia)) };
  }

  /** Faturas recuperadas no período, uma por linha (auditoria da comissão). */
  async detalhe(tenantId: string, de?: string, ate?: string) {
    const p = await this.periodo(tenantId, de, ate);
    const faturas = await this.prisma.invoice.findMany({
      where: { tenantId, status: 'PAGA', atribuidoEm: { not: null }, pagoEm: { gte: p.gte, lte: p.lte } },
      orderBy: { pagoEm: 'desc' },
      take: MAX_DETALHE,
      select: {
        id: true, valor: true, vencimento: true, pagoEm: true, diasAtrasoPagamento: true, sourceExternalId: true, externalId: true, descricao: true,
        origemAtendimento: true, negociadoPor: { select: { nome: true } },
        recuperadoOrigem: true, recuperadoCarteira: true, recuperadoDispatchId: true,
        recuperadoPor: { select: { nome: true } },
        customer: { select: { nome: true, doc: true, contrato: true } },
      },
    });
    const dispIds = faturas.map((f) => f.recuperadoDispatchId).filter(Boolean) as string[];
    const disps = dispIds.length
      ? await this.prisma.messageDispatch.findMany({
          where: { id: { in: dispIds } },
          select: { id: true, canal: true, enviadoEm: true, createdAt: true, ruleNome: true, user: { select: { nome: true } }, channelAccount: { select: { apelido: true, numero: true } } },
        })
      : [];
    const dmap = new Map(disps.map((d) => [d.id, d]));
    const dt = (d?: Date | null) => (d ? d.toLocaleDateString('pt-BR', { timeZone: p.timezone }) : '');
    const venc = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    return faturas.map((f) => {
      const d = f.recuperadoDispatchId ? dmap.get(f.recuperadoDispatchId) : undefined;
      return {
        Cliente: f.customer.nome,
        Documento: f.customer.doc,
        Contrato: f.customer.contrato ?? '',
        'Nº da fatura': f.sourceExternalId ?? f.externalId ?? f.id,
        Valor: Number(f.valor),
        Vencimento: venc(f.vencimento),
        'Pago em': dt(f.pagoEm),
        'Dias de atraso': f.diasAtrasoPagamento ?? 0,
        Carteira: f.recuperadoCarteira ?? 'Antes da carteira',
        'Responsável (crédito)': f.recuperadoPor?.nome ?? 'Sem responsável',
        'Origem do último contato': ROTULO_ORIGEM[f.recuperadoOrigem ?? 'SEM_CONTATO'],
        'Origem do atendimento': f.origemAtendimento ?? '',
        'Negociado por': f.negociadoPor?.nome ?? '',
        'Último contato em': d ? dt(d.enviadoEm ?? d.createdAt) : '',
        'Canal': d ? nomeCanal(d.canal) : f.recuperadoOrigem === 'MANUAL' ? nomeCanal('NOTA') : '',
        'Número/conta': d?.channelAccount ? [d.channelAccount.apelido, d.channelAccount.numero].filter(Boolean).join(' · ') : '',
        'Enviado por': d?.user?.nome ?? (d ? `Régua${d.ruleNome ? ` · ${d.ruleNome}` : ''}` : ''),
      };
    });
  }

  async exportCsv(tenantId: string, de?: string, ate?: string): Promise<string> {
    const linhas = await this.detalhe(tenantId, de, ate);
    const cols = Object.keys(linhas[0] ?? COLUNAS_VAZIAS);
    return toCsv(cols.map((k) => ({ key: k, label: k })), linhas as unknown as Record<string, unknown>[]);
  }

  async exportXlsx(tenantId: string, de?: string, ate?: string) {
    const [rel, linhas] = await Promise.all([this.relatorio(tenantId, de, ate), this.detalhe(tenantId, de, ate)]);
    const wb = XLSX.utils.book_new();
    const resumo = [
      { Indicador: 'Disparos automáticos (régua)', Valor: rel.totais.disparos.regua },
      { Indicador: 'Disparos manuais', Valor: rel.totais.disparos.manual },
      { Indicador: 'Disparos de campanha', Valor: rel.totais.disparos.campanha },
      { Indicador: 'Clientes contatados', Valor: rel.totais.clientesContatados },
      { Indicador: 'Recuperado — régua (R$)', Valor: rel.totais.recuperado.REGUA.valor },
      { Indicador: 'Recuperado — manual (R$)', Valor: rel.totais.recuperado.MANUAL.valor },
      { Indicador: 'Recuperado — campanha (R$)', Valor: rel.totais.recuperado.CAMPANHA.valor },
      { Indicador: 'Pago sem contato (R$)', Valor: rel.totais.recuperado.SEM_CONTATO.valor },
      { Indicador: 'Total recebido (R$)', Valor: rel.totais.recebido.valor },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rel.operadores.map((o) => ({
      Operador: o.nome, Carteira: o.carteira ?? '', 'Clientes na carteira': o.clientesNaCarteira,
      'Disparos automáticos': o.disparosAutomaticos, 'Disparos manuais': o.disparosManuais, 'Clientes contatados': o.clientesContatados,
      'Recuperado régua (R$)': o.recuperado.REGUA.valor, 'Faturas régua': o.recuperado.REGUA.faturas,
      'Recuperado manual (R$)': o.recuperado.MANUAL.valor, 'Faturas manual': o.recuperado.MANUAL.faturas,
      'Recuperado campanha (R$)': o.recuperado.CAMPANHA.valor,
      'Pago sem contato (R$)': o.recuperado.SEM_CONTATO.valor,
      'Total recuperado (R$)': o.recuperadoComContato.valor, 'Faturas recuperadas': o.recuperadoComContato.faturas,
    }))), 'Por operador');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rel.carteiras.map((c) => ({
      Carteira: c.nome, 'Recuperado régua (R$)': c.recuperado.REGUA.valor, 'Recuperado manual (R$)': c.recuperado.MANUAL.valor,
      'Pago sem contato (R$)': c.recuperado.SEM_CONTATO.valor, 'Faturas pagas': c.faturas,
    }))), 'Por carteira');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rel.canais.map((c) => ({
      Canal: c.canal, 'Conta / número': c.conta, 'Disparos régua': c.disparosRegua, 'Disparos manuais': c.disparosManuais,
      'Faturas recuperadas': c.faturas, 'Recuperado (R$)': c.valor,
    }))), 'Por canal e número');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.length ? linhas : [COLUNAS_VAZIAS]), 'Faturas recuperadas');
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return {
      filename: `recuperacao-${rel.periodo.de}_${rel.periodo.ate}.xlsx`,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: buf.toString('base64'),
    };
  }
}

export const ROTULO_ORIGEM: Record<string, string> = {
  REGUA: 'Automático (régua)',
  MANUAL: 'Manual',
  CAMPANHA: 'Campanha',
  SEM_CONTATO: 'Sem contato (pagou sozinho)',
};

const COLUNAS_VAZIAS = {
  Cliente: '', Documento: '', Contrato: '', 'Nº da fatura': '', Valor: '', Vencimento: '', 'Pago em': '', 'Dias de atraso': '', Carteira: '',
  'Responsável (crédito)': '', 'Origem do último contato': '', 'Origem do atendimento': '', 'Negociado por': '', 'Último contato em': '', Canal: '', 'Número/conta': '', 'Enviado por': '',
};

