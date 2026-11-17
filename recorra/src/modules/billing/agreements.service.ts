import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgreementStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/common/audit/audit.service';
import { valorComDesconto, buildInstallments } from './agreement';
import { parseDateOrThrow } from '@/common/util/parse';
import { CreateAgreementDto } from './dto/create-agreement.dto';
import { AtualizarAcordoDto, RegistrarAcordoDto } from './dto/registro-acordo.dto';

/**
 * Negociação/acordo de dívida: agrupa faturas vencidas, aplica desconto e
 * parcela, gerando novas faturas (origem "acordo"). As faturas originais são
 * canceladas (substituídas pelo acordo).
 */
@Injectable()
export class AgreementsService {
  /** Teto de desconto permitido em acordo (proteção contra perdão total acidental/malicioso). */
  private static readonly MAX_DESCONTO_PCT = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenantId: string) {
    return this.prisma.agreement.findMany({
      where: { tenantId },
      include: { installments: { orderBy: { numero: 'asc' } }, customer: { select: { nome: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(tenantId: string, id: string) {
    const a = await this.prisma.agreement.findFirst({
      where: { id, tenantId },
      include: { installments: { orderBy: { numero: 'asc' } } },
    });
    if (!a) throw new NotFoundException('Acordo não encontrado');
    return a;
  }

  async create(tenantId: string, dto: CreateAgreementDto, actorId?: string) {
    if (!dto.faturaIds?.length) throw new BadRequestException('Informe as faturas a renegociar');
    // Defesa em profundidade (o DTO já limita 1..72 via ValidationPipe): evita o
    // DoS de gerar milhões de faturas numa transação caso o service seja chamado direto.
    if (!Number.isInteger(dto.parcelas) || dto.parcelas < 1 || dto.parcelas > 72) {
      throw new BadRequestException('Número de parcelas inválido (1 a 72).');
    }
    const desconto = dto.descontoPct ?? 0;
    if (desconto < 0 || desconto > AgreementsService.MAX_DESCONTO_PCT) {
      throw new BadRequestException(`Desconto inválido: deve ser entre 0% e ${AgreementsService.MAX_DESCONTO_PCT}%.`);
    }

    // Só renegocia faturas em aberto — não reabrir/cancelar faturas já pagas ou canceladas.
    const faturas = await this.prisma.invoice.findMany({
      where: { tenantId, id: { in: dto.faturaIds }, customerId: dto.customerId, status: { in: ['PENDENTE', 'VENCIDA'] } },
    });
    if (!faturas.length) throw new BadRequestException('Faturas não encontradas para este cliente');
    if (faturas.length !== dto.faturaIds.length) {
      throw new BadRequestException('Uma ou mais faturas não estão em aberto ou não pertencem ao cliente.');
    }

    const valorOriginal = faturas.reduce((s, f) => s + Number(f.valor), 0);
    const descontoPct = dto.descontoPct ?? 0;
    const valorAcordado = valorComDesconto(valorOriginal, descontoPct);
    const primeira = dto.primeiraData ? parseDateOrThrow(dto.primeiraData, 'primeiraData') : this.hojeMais(5);
    const parcelas = buildInstallments(valorAcordado, dto.parcelas, primeira);
    // Parcela não pode ser zero/negativa (ex.: muitas parcelas para valor baixo).
    if (parcelas.some((p) => p.valor <= 0)) {
      throw new BadRequestException('Parcelas demais para o valor: geraria parcela de R$ 0,00 ou negativa.');
    }

    // Transação: cria acordo + parcelas + faturas novas; cancela as originais.
    const criado = await this.prisma.$transaction(async (tx) => {
      const agreement = await tx.agreement.create({
        data: {
          tenantId,
          customerId: dto.customerId,
          valorOriginal,
          descontoPct,
          valorAcordado,
          parcelas: dto.parcelas,
          faturasOrigem: dto.faturaIds,
          observacao: dto.observacao,
        },
      });

      for (const p of parcelas) {
        const invoice = await tx.invoice.create({
          data: {
            tenantId,
            customerId: dto.customerId,
            descricao: `Acordo ${agreement.id.slice(0, 6)} - parcela ${p.numero}/${dto.parcelas}`,
            valor: p.valor,
            vencimento: p.vencimento,
            status: 'PENDENTE',
            origem: 'acordo',
          },
        });
        await tx.agreementInstallment.create({
          data: { agreementId: agreement.id, numero: p.numero, valor: p.valor, vencimento: p.vencimento, invoiceId: invoice.id },
        });
      }

      // cancela as faturas renegociadas — só as que estavam em aberto (já validado acima).
      await tx.invoice.updateMany({
        where: { tenantId, id: { in: dto.faturaIds }, status: { in: ['PENDENTE', 'VENCIDA'] } },
        data: { status: 'CANCELADA' },
      });

      return tx.agreement.findUniqueOrThrow({
        where: { id: agreement.id },
        include: { installments: { orderBy: { numero: 'asc' } } },
      });
    });

    await this.audit.record({
      tenantId, userId: actorId, acao: 'agreement.create', entidade: 'Agreement', entidadeId: criado.id,
      depois: { valorOriginal, descontoPct, valorAcordado, parcelas: dto.parcelas, faturasOrigem: dto.faturaIds },
    });
    return criado;
  }

  // ---------- Registro de acordo (o que foi combinado com o cliente) ----------

  /** Anota o acordo feito por ligação/chat. Não mexe em faturas: é um registro editável. */
  async registrar(tenantId: string, dto: RegistrarAcordoDto, actorId?: string) {
    const cliente = await this.prisma.customer.findFirst({ where: { id: dto.customerId, tenantId }, select: { id: true } });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    const valorAcordado = dto.valorAcordado ?? 0;
    const valorOriginal = dto.valorOriginal ?? valorAcordado;
    const criado = await this.prisma.agreement.create({
      data: {
        tenantId, customerId: dto.customerId, origem: 'registro', criadoPorId: actorId ?? null,
        tipo: dto.tipo.trim(), formaPagamento: dto.formaPagamento,
        dataAcordo: dto.dataAcordo ? parseDateOrThrow(dto.dataAcordo, 'dataAcordo') : new Date(),
        dataPrevista: dto.dataPrevista ? parseDateOrThrow(dto.dataPrevista, 'dataPrevista') : null,
        valorOriginal, valorAcordado, descontoPct: this.descontoDe(valorOriginal, valorAcordado),
        parcelas: dto.parcelas ?? 1, observacao: dto.observacao?.trim() || null,
      },
      include: { criadoPor: { select: { nome: true } } },
    });
    await this.audit.record({
      tenantId, userId: actorId, acao: 'agreement.registro.create', entidade: 'Agreement', entidadeId: criado.id,
      depois: { tipo: criado.tipo, formaPagamento: criado.formaPagamento, dataPrevista: criado.dataPrevista, valorAcordado },
    });
    return criado;
  }

  /**
   * Edita o acordo. Em acordos que vieram de renegociação (geraram parcelas/faturas)
   * valores e parcelas não mudam aqui — só tipo, forma, datas, status e observação.
   */
  async atualizar(tenantId: string, id: string, dto: AtualizarAcordoDto, actorId?: string) {
    const a = await this.get(tenantId, id);
    const reneg = a.origem !== 'registro';
    if (reneg && (dto.valorOriginal !== undefined || dto.valorAcordado !== undefined || dto.parcelas !== undefined)) {
      throw new BadRequestException('Este acordo gerou parcelas e faturas: valor e parcelas não podem ser alterados aqui.');
    }
    const data: Record<string, unknown> = {};
    if (dto.tipo !== undefined) data.tipo = dto.tipo.trim();
    if (dto.formaPagamento !== undefined) data.formaPagamento = dto.formaPagamento;
    if (dto.dataAcordo !== undefined) data.dataAcordo = parseDateOrThrow(dto.dataAcordo, 'dataAcordo');
    if (dto.dataPrevista !== undefined) data.dataPrevista = dto.dataPrevista ? parseDateOrThrow(dto.dataPrevista, 'dataPrevista') : null;
    if (dto.observacao !== undefined) data.observacao = dto.observacao.trim() || null;
    if (dto.status !== undefined) data.status = dto.status as AgreementStatus;
    if (!reneg) {
      const acordado = dto.valorAcordado ?? Number(a.valorAcordado);
      const original = dto.valorOriginal ?? (dto.valorAcordado !== undefined && Number(a.valorOriginal) === Number(a.valorAcordado) ? acordado : Number(a.valorOriginal));
      if (dto.valorAcordado !== undefined || dto.valorOriginal !== undefined) {
        data.valorAcordado = acordado; data.valorOriginal = original; data.descontoPct = this.descontoDe(original, acordado);
      }
      if (dto.parcelas !== undefined) data.parcelas = dto.parcelas;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Nada para alterar');
    const upd = await this.prisma.agreement.update({
      where: { id }, data,
      include: { installments: { orderBy: { numero: 'asc' } }, criadoPor: { select: { nome: true } } },
    });
    await this.audit.record({
      tenantId, userId: actorId, acao: 'agreement.update', entidade: 'Agreement', entidadeId: id,
      antes: { tipo: a.tipo, formaPagamento: a.formaPagamento, status: a.status, dataPrevista: a.dataPrevista },
      depois: { ...data } as object,
    });
    return upd;
  }

  /**
   * Exclui um acordo ANOTADO (registro). Renegociações geraram faturas e cancelaram as
   * originais — essas só podem ser canceladas. Operador só exclui o que ele mesmo registrou.
   */
  async excluir(tenantId: string, id: string, actor: { id: string; role: string }) {
    const a = await this.get(tenantId, id);
    if (a.origem !== 'registro') {
      throw new BadRequestException('Este acordo gerou parcelas e faturas e não pode ser excluído — use "Cancelar acordo".');
    }
    const gestao = ['OWNER', 'ADMIN', 'FINANCEIRO'].includes(actor.role);
    if (!gestao && a.criadoPorId !== actor.id) throw new ForbiddenException('Você só pode excluir os acordos que você registrou.');
    await this.prisma.agreement.delete({ where: { id } });
    await this.audit.record({
      tenantId, userId: actor.id, acao: 'agreement.registro.delete', entidade: 'Agreement', entidadeId: id,
      antes: { tipo: a.tipo, formaPagamento: a.formaPagamento, valorAcordado: Number(a.valorAcordado), dataPrevista: a.dataPrevista, observacao: a.observacao },
    });
    return { ok: true };
  }

  private descontoDe(original: number, acordado: number): number {
    return original > 0 && acordado > 0 && acordado < original ? Math.round((1 - acordado / original) * 10000) / 100 : 0;
  }

  async cancel(tenantId: string, id: string, actorId?: string) {
    await this.get(tenantId, id);
    await this.prisma.agreement.update({ where: { id }, data: { status: 'CANCELADO' } });
    await this.audit.record({
      tenantId, userId: actorId, acao: 'agreement.cancel', entidade: 'Agreement', entidadeId: id,
      depois: { status: 'CANCELADO' },
    });
    return { ok: true };
  }

  private hojeMais(dias: number): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dias);
    return d;
  }
}
