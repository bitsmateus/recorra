import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { carteiraDaFaixa } from '@/modules/dunning/carteiras';
import { dividirEmBlocos, distribuir, ModoDistribuicao } from './distribuicao';

export interface ResumoCarteira {
  carteiraId: string;
  carteira: string;
  modo: ModoDistribuicao;
  clientes: number;
  atribuidos: number;
  mantidos: number;
  operadores: { id: string; nome: string; clientes: number }[];
  /** Modo BLOCOS: quem está com o topo (os mais atrasados) hoje. */
  topo?: string;
  /** Modo BLOCOS: true = a lista foi dividida de novo agora; false = só os sem dono foram encaixados. */
  divisaoCompleta?: boolean;
  aviso?: string;
}

/**
 * Rotina diária (e botão "Distribuir agora"): olha todos os clientes com fatura
 * vencida, descobre a carteira de cada um pelo atraso mais antigo e divide os que
 * ainda não têm dono entre os operadores daquela carteira. Substitui a planilha
 * diária de "500 vencidos, 250 para cada".
 */
@Injectable()
export class DistribuicaoService {
  private readonly logger = new Logger(DistribuicaoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * `completo`: nas carteiras em BLOCOS, refaz a divisão da lista inteira (é o que
   * a rotina das 6h faz). Sem ele, quem já foi dividido hoje só ganha os clientes
   * novos (sem dono) — o botão "Distribuir agora" não embaralha o dia da equipe.
   */
  async distribuirTenant(tenantId: string, userId: string | null = null, ref = new Date(), completo = false): Promise<ResumoCarteira[]> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } });
    const diaLocal = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: tenant.timezone });
    // Número do dia (muda à meia-noite local): é ele que reveza o topo.
    const diaIndice = Math.floor(Date.parse(`${diaLocal(ref)}T00:00:00Z`) / 86_400_000);
    const carteiras = await this.prisma.carteira.findMany({ where: { tenantId }, orderBy: { diaMinimo: 'asc' } });
    const ativas = carteiras.filter((c) => c.distribuicao !== 'MANUAL');
    if (!ativas.length) return [];

    const hojeUtc = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
    const vencidas = await this.prisma.invoice.findMany({
      where: {
        tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, gestaoCobranca: 'ATIVA', contestada: false,
        vencimento: { lt: new Date(hojeUtc) }, customer: { ativo: true },
      },
      select: { customerId: true, vencimento: true, customer: { select: { responsavelId: true, promessaAte: true } } },
    });

    // Atraso do cliente = o da fatura mais antiga em aberto.
    const porCliente = new Map<string, { dias: number; responsavelId: string | null; promessaAte: Date | null }>();
    for (const f of vencidas) {
      const v = f.vencimento;
      const dias = Math.round((hojeUtc - Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())) / 86_400_000);
      const atual = porCliente.get(f.customerId);
      if (!atual || dias > atual.dias) porCliente.set(f.customerId, { dias, responsavelId: f.customer.responsavelId, promessaAte: f.customer.promessaAte });
    }

    const resumo: ResumoCarteira[] = [];
    for (const cart of ativas) {
      const operadores = await this.prisma.user.findMany({
        where: { tenantId, carteiraId: cart.id, ativo: true },
        select: { id: true, nome: true },
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      });
      // Ordem estável: mais atrasado primeiro (balanceia também a "dificuldade").
      const clientes = [...porCliente.entries()]
        .filter(([, c]) => carteiraDaFaixa(c.dias, carteiras)?.id === cart.id)
        .sort((a, b) => b[1].dias - a[1].dias || a[0].localeCompare(b[0]))
        .map(([id, c]) => ({ id, responsavelId: c.responsavelId, promessaAte: c.promessaAte }));

      const base: ResumoCarteira = {
        carteiraId: cart.id, carteira: cart.nome, modo: cart.distribuicao as ModoDistribuicao,
        clientes: clientes.length, atribuidos: 0, mantidos: 0, operadores: [],
      };
      if (!operadores.length) {
        resumo.push({ ...base, aviso: 'Nenhum operador ativo nesta carteira — vincule operadores em Equipe.' });
        continue;
      }

      // ---- BLOCOS (cima/baixo): divisão completa da lista do dia ----
      const jaDividiuHoje = !!cart.distribuicaoEm && diaLocal(cart.distribuicaoEm) === diaLocal(ref);
      if (cart.distribuicao === 'BLOCOS' && (completo || !jaDividiuHoje)) {
        const ids = new Set(operadores.map((o) => o.id));
        const b = dividirEmBlocos({
          operadores: operadores.map((o) => o.id),
          // Promessa em vigor com uma operadora desta carteira: o cliente fica com ela.
          clientes: clientes.map((c) => ({ id: c.id, responsavelId: c.responsavelId, fixo: !!c.promessaAte && c.promessaAte.getTime() >= hojeUtc && !!c.responsavelId && ids.has(c.responsavelId) })),
          diaIndice,
        });
        const atual = new Map(clientes.map((c) => [c.id, c.responsavelId]));
        const trocas = new Map<string, string[]>();
        for (const [cid, op] of b.atribuicoes) if (atual.get(cid) !== op) trocas.set(op, [...(trocas.get(op) ?? []), cid]);
        for (const [op, lista] of trocas) await this.prisma.customer.updateMany({ where: { tenantId, id: { in: lista } }, data: { responsavelId: op } });
        await this.prisma.carteira.update({ where: { id: cart.id }, data: { distribuicaoEm: ref } });
        const nome = new Map(operadores.map((o) => [o.id, o.nome]));
        const mudaram = [...trocas.values()].reduce((s, l) => s + l.length, 0);
        const item: ResumoCarteira = {
          ...base, atribuidos: mudaram, mantidos: b.atribuicoes.size - mudaram,
          operadores: operadores.map((o) => ({ id: o.id, nome: o.nome, clientes: b.carga.get(o.id) ?? 0 })),
          topo: nome.get(b.ordemDoDia[0]), divisaoCompleta: true,
        };
        resumo.push(item);
        await this.prisma.auditLog.create({
          data: {
            tenantId, userId, acao: 'distribuicao.blocos', entidade: 'Carteira', entidadeId: cart.id,
            depois: { clientes: clientes.length, topo: item.topo, operadores: item.operadores, mudaram } as object,
          },
        });
        continue;
      }

      const r = distribuir({
        // BLOCOS já dividido hoje: só encaixa quem chegou depois (sem dono), pela carga.
        modo: (cart.distribuicao === 'BLOCOS' ? 'BALANCEADA' : cart.distribuicao) as ModoDistribuicao,
        operadores: operadores.map((o) => o.id),
        clientes,
        cursor: cart.distribuicaoCursor,
      });

      // Uma atualização por operador (em vez de uma por cliente).
      const porOperador = new Map<string, string[]>();
      for (const [cid, op] of r.atribuicoes) porOperador.set(op, [...(porOperador.get(op) ?? []), cid]);
      for (const [op, ids] of porOperador) {
        await this.prisma.customer.updateMany({ where: { tenantId, id: { in: ids } }, data: { responsavelId: op } });
      }
      if (cart.distribuicao === 'SEQUENCIAL' && r.cursor !== cart.distribuicaoCursor) {
        await this.prisma.carteira.update({ where: { id: cart.id }, data: { distribuicaoCursor: r.cursor } });
      }

      const item: ResumoCarteira = {
        ...base,
        atribuidos: r.atribuicoes.size,
        mantidos: r.mantidos,
        operadores: operadores.map((o) => ({ id: o.id, nome: o.nome, clientes: r.carga.get(o.id) ?? 0 })),
        ...(cart.distribuicao === 'BLOCOS' ? { divisaoCompleta: false } : {}),
      };
      resumo.push(item);
      if (r.atribuicoes.size) {
        await this.prisma.auditLog.create({
          data: {
            tenantId, userId, acao: 'distribuicao.automatica', entidade: 'Carteira', entidadeId: cart.id,
            depois: { modo: cart.distribuicao, atribuidos: r.atribuicoes.size, mantidos: r.mantidos, operadores: item.operadores } as object,
          },
        });
      }
    }
    return resumo;
  }

  /** Rotina do worker: todos os tenants que têm alguma carteira com distribuição automática. */
  async distribuirTodos(): Promise<void> {
    const tenants = await this.prisma.carteira.findMany({
      where: { distribuicao: { not: 'MANUAL' }, tenant: { ativo: true } },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });
    for (const t of tenants) {
      try {
        const r = await this.distribuirTenant(t.tenantId, null, new Date(), true); // rotina diária: divisão completa
        const n = r.reduce((s, c) => s + c.atribuidos, 0);
        if (n) this.logger.log(`Distribuição automática (${t.tenantId}): ${n} cliente(s) atribuídos`);
      } catch (e) {
        this.logger.error(`Falha na distribuição automática (${t.tenantId}): ${String(e)}`);
      }
    }
  }
}
