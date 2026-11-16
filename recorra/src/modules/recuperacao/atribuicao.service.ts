import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { atribuir, Contato } from './atribuicao';

const LOTE = 500;
const SUCESSO = ['ENVIADO', 'ENTREGUE', 'LIDO'] as const;

/**
 * Preenche a atribuição das faturas pagas. Roda no worker em ciclo curto, em vez
 * de ser chamada em cada ponto que dá baixa (webhook de gateway, conciliação, sync
 * de ERP, import, baixa manual): pegar "PAGA ainda não atribuída" cobre todos os
 * caminhos de uma vez. Uma fatura que volta a ser paga (pagoEm novo, depois da
 * última atribuição) é reprocessada.
 */
@Injectable()
export class AtribuicaoService {
  private readonly logger = new Logger(AtribuicaoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Ids de faturas pagas pendentes de atribuição (ou com pagamento mais novo que a atribuição). */
  private async pendentes(tenantId: string | null, limite: number): Promise<{ id: string; tenantId: string }[]> {
    return tenantId
      ? this.prisma.$queryRaw`SELECT id, "tenantId" FROM invoices
          WHERE "tenantId" = ${tenantId} AND status = 'PAGA'
            AND ("atribuidoEm" IS NULL OR "atribuidoEm" < "pagoEm")
          LIMIT ${limite}`
      : this.prisma.$queryRaw`SELECT id, "tenantId" FROM invoices
          WHERE status = 'PAGA' AND ("atribuidoEm" IS NULL OR "atribuidoEm" < "pagoEm")
          LIMIT ${limite}`;
  }

  /** Processa até `maxLotes` lotes. Retorna quantas faturas foram atribuídas. */
  async processar(tenantId: string | null = null, maxLotes = 20): Promise<number> {
    let total = 0;
    for (let i = 0; i < maxLotes; i++) {
      const ids = await this.pendentes(tenantId, LOTE);
      if (!ids.length) break;
      const porTenant = new Map<string, string[]>();
      for (const r of ids) porTenant.set(r.tenantId, [...(porTenant.get(r.tenantId) ?? []), r.id]);
      for (const [tid, lista] of porTenant) total += await this.atribuirFaturas(tid, lista);
      if (ids.length < LOTE) break;
    }
    if (total) this.logger.log(`Recuperação atribuída: ${total} fatura(s)`);
    return total;
  }

  /** Recalcula do zero as faturas pagas de um tenant (ex.: mudou a janela). */
  async recalcularTenant(tenantId: string): Promise<number> {
    await this.prisma.invoice.updateMany({ where: { tenantId, status: 'PAGA' }, data: { atribuidoEm: null } });
    return this.processar(tenantId, 1000);
  }

  async atribuirFaturas(tenantId: string, invoiceIds: string[]): Promise<number> {
    const [tenant, carteiras, faturas] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { janelaAtribuicaoDias: true, timezone: true } }),
      this.prisma.carteira.findMany({ where: { tenantId }, select: { id: true, nome: true, diaMinimo: true } }),
      this.prisma.invoice.findMany({
        where: { tenantId, id: { in: invoiceIds }, status: 'PAGA' },
        select: { id: true, customerId: true, vencimento: true, pagoEm: true, updatedAt: true, customer: { select: { responsavelId: true } } },
      }),
    ]);
    if (!faturas.length) return 0;
    const janela = tenant.janelaAtribuicaoDias ?? 7;
    const pagos = faturas.map((f) => (f.pagoEm ?? f.updatedAt).getTime());
    const desde = new Date(Math.min(...pagos) - janela * 86_400_000);
    const ate = new Date(Math.max(...pagos));
    const clientes = [...new Set(faturas.map((f) => f.customerId))];

    // Toques no período de todos os clientes do lote, de uma vez.
    const [disparos, notas] = await Promise.all([
      this.prisma.messageDispatch.findMany({
        where: {
          tenantId, customerId: { in: clientes },
          status: { in: [...SUCESSO] },
          origem: { in: ['REGUA', 'MANUAL', 'CAMPANHA'] },
          canal: { not: 'WEBHOOK' },
          createdAt: { gte: desde, lte: ate },
        },
        select: { id: true, customerId: true, invoiceId: true, origem: true, userId: true, enviadoEm: true, createdAt: true },
      }),
      // Nota/promessa registrada pelo operador = ele falou com o cliente (inclusive
      // pelo chat do NX, que não passa pelo Recorra). Conta como contato manual.
      this.prisma.customerNote.findMany({
        where: { tenantId, customerId: { in: clientes }, userId: { not: null }, createdAt: { gte: desde, lte: ate } },
        select: { customerId: true, userId: true, createdAt: true },
      }),
    ]);
    const contatos = new Map<string, Contato[]>();
    const add = (cid: string, c: Contato) => contatos.set(cid, [...(contatos.get(cid) ?? []), c]);
    for (const d of disparos) {
      add(d.customerId, {
        data: d.enviadoEm ?? d.createdAt,
        origem: d.origem as Contato['origem'],
        userId: d.userId,
        dispatchId: d.id,
        invoiceId: d.invoiceId,
      });
    }
    for (const n of notas) add(n.customerId, { data: n.createdAt, origem: 'MANUAL', userId: n.userId });

    const agora = new Date();
    for (const f of faturas) {
      const pagoEm = f.pagoEm ?? f.updatedAt;
      const a = atribuir({
        invoiceId: f.id,
        vencimento: f.vencimento,
        pagoEm,
        responsavelId: f.customer.responsavelId,
        janelaDias: janela,
        carteiras,
        contatos: contatos.get(f.customerId) ?? [],
        timezone: tenant.timezone,
      });
      // atribuidoEm >= pagoEm: garante que o critério "atribuidoEm < pagoEm" não reprocessa.
      const marca = pagoEm > agora ? pagoEm : agora;
      await this.prisma.invoice.update({
        where: { id: f.id },
        data: { ...a, atribuidoEm: marca, ...(f.pagoEm ? {} : { pagoEm }) },
      });
    }
    return faturas.length;
  }
}
