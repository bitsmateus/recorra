import { Injectable } from '@nestjs/common';
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

  async relatorio(tenantId: string, de?: string, ate?: string): Promise<Relatorio> {
    const p = await this.periodo(tenantId, de, ate);

    const [disparos, contatadosPorOp, contatadosTotal, recuperados, usuarios, carteiras, contas, pendentes, clientesPorOp] = await Promise.all([
      // Disparos com sucesso no período. Manual conta para quem enviou; automático
      // e campanha contam para a responsável pelo cliente (a "carteira" dela).
      this.prisma.$queryRaw<LinhaDisparo[]>`
        SELECT d.origem::text AS origem, d.canal::text AS canal, d."channelAccountId" AS "contaId",
               CASE WHEN d.origem = 'MANUAL' THEN d."userId" ELSE c."responsavelId" END AS "operadorId",
               count(*)::int AS n
          FROM message_dispatches d JOIN customers c ON c.id = d."customerId"
         WHERE d."tenantId" = ${tenantId}
           AND d.status IN ('ENVIADO','ENTREGUE','LIDO')
           AND d.origem IN ('REGUA','MANUAL','CAMPANHA') AND d.canal <> 'WEBHOOK'
           AND d."createdAt" BETWEEN ${p.gte} AND ${p.lte}
         GROUP BY 1,2,3,4`,
      this.prisma.$queryRaw<{ operadorId: string | null; n: number }[]>`
        SELECT CASE WHEN d.origem = 'MANUAL' THEN d."userId" ELSE c."responsavelId" END AS "operadorId",
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

    return montarRelatorio({
      de: p.gte, ate: p.lte, janelaDias: p.janela,
      disparos, contatadosPorOp, contatadosTotal: contatadosTotal[0]?.n ?? 0, recuperados,
      usuarios: usuarios.map((u) => ({ id: u.id, nome: u.nome, role: u.role, ativo: u.ativo, carteira: u.carteira?.nome ?? null })),
      carteiras: carteiras.map((c) => c.nome),
      contas, pendentesAtribuicao: pendentes,
      clientesPorOp,
    });
  }

  /** Faturas recuperadas no período, uma por linha (auditoria da comissão). */
  async detalhe(tenantId: string, de?: string, ate?: string) {
    const p = await this.periodo(tenantId, de, ate);
    const faturas = await this.prisma.invoice.findMany({
      where: { tenantId, status: 'PAGA', atribuidoEm: { not: null }, pagoEm: { gte: p.gte, lte: p.lte } },
      orderBy: { pagoEm: 'desc' },
      take: MAX_DETALHE,
      select: {
        id: true, valor: true, vencimento: true, pagoEm: true, diasAtrasoPagamento: true,
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
        Valor: Number(f.valor),
        Vencimento: venc(f.vencimento),
        'Pago em': dt(f.pagoEm),
        'Dias de atraso': f.diasAtrasoPagamento ?? 0,
        Carteira: f.recuperadoCarteira ?? 'Antes da carteira',
        'Responsável (crédito)': f.recuperadoPor?.nome ?? 'Sem responsável',
        'Origem do último contato': ROTULO_ORIGEM[f.recuperadoOrigem ?? 'SEM_CONTATO'],
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
  Cliente: '', Documento: '', Contrato: '', Valor: '', Vencimento: '', 'Pago em': '', 'Dias de atraso': '', Carteira: '',
  'Responsável (crédito)': '', 'Origem do último contato': '', 'Último contato em': '', Canal: '', 'Número/conta': '', 'Enviado por': '',
};

