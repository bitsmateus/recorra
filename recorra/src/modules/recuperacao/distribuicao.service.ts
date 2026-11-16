import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { carteiraDaFaixa } from '@/modules/dunning/carteiras';
import { distribuir, ModoDistribuicao } from './distribuicao';

export interface ResumoCarteira {
  carteiraId: string;
  carteira: string;
  modo: ModoDistribuicao;
  clientes: number;
  atribuidos: number;
  mantidos: number;
  operadores: { id: string; nome: string; clientes: number }[];
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

  async distribuirTenant(tenantId: string, userId: string | null = null, ref = new Date()): Promise<ResumoCarteira[]> {
    const carteiras = await this.prisma.carteira.findMany({ where: { tenantId }, orderBy: { diaMinimo: 'asc' } });
    const ativas = carteiras.filter((c) => c.distribuicao !== 'MANUAL');
    if (!ativas.length) return [];

    const hojeUtc = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
    const vencidas = await this.prisma.invoice.findMany({
      where: {
        tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, gestaoCobranca: 'ATIVA', contestada: false,
        vencimento: { lt: new Date(hojeUtc) }, customer: { ativo: true },
      },
      select: { customerId: true, vencimento: true, customer: { select: { responsavelId: true } } },
    });

    // Atraso do cliente = o da fatura mais antiga em aberto.
    const porCliente = new Map<string, { dias: number; responsavelId: string | null }>();
    for (const f of vencidas) {
      const v = f.vencimento;
      const dias = Math.round((hojeUtc - Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())) / 86_400_000);
      const atual = porCliente.get(f.customerId);
      if (!atual || dias > atual.dias) porCliente.set(f.customerId, { dias, responsavelId: f.customer.responsavelId });
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
        .map(([id, c]) => ({ id, responsavelId: c.responsavelId }));

      const base: ResumoCarteira = {
        carteiraId: cart.id, carteira: cart.nome, modo: cart.distribuicao as ModoDistribuicao,
        clientes: clientes.length, atribuidos: 0, mantidos: 0, operadores: [],
      };
      if (!operadores.length) {
        resumo.push({ ...base, aviso: 'Nenhum operador ativo nesta carteira — vincule operadores em Equipe.' });
        continue;
      }

      const r = distribuir({
        modo: cart.distribuicao as ModoDistribuicao,
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
        const r = await this.distribuirTenant(t.tenantId);
        const n = r.reduce((s, c) => s + c.atribuidos, 0);
        if (n) this.logger.log(`Distribuição automática (${t.tenantId}): ${n} cliente(s) atribuídos`);
      } catch (e) {
        this.logger.error(`Falha na distribuição automática (${t.tenantId}): ${String(e)}`);
      }
    }
  }
}
