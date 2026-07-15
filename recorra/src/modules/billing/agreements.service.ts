import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/common/audit/audit.service';
import { valorComDesconto, buildInstallments } from './agreement';

interface CreateAgreementDto {
  customerId: string;
  faturaIds: string[]; // faturas vencidas a renegociar
  descontoPct?: number;
  parcelas: number;
  primeiraData?: string; // ISO; default: hoje + 5 dias
  observacao?: string;
}

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
    if (dto.parcelas < 1) throw new BadRequestException('Número de parcelas inválido');
    const desconto = dto.descontoPct ?? 0;
    if (desconto < 0 || desconto > AgreementsService.MAX_DESCONTO_PCT) {
      throw new BadRequestException(`Desconto inválido: deve ser entre 0% e ${AgreementsService.MAX_DESCONTO_PCT}%.`);
    }

    const faturas = await this.prisma.invoice.findMany({
      where: { tenantId, id: { in: dto.faturaIds }, customerId: dto.customerId },
    });
    if (!faturas.length) throw new BadRequestException('Faturas não encontradas para este cliente');

    const valorOriginal = faturas.reduce((s, f) => s + Number(f.valor), 0);
    const descontoPct = dto.descontoPct ?? 0;
    const valorAcordado = valorComDesconto(valorOriginal, descontoPct);
    const primeira = dto.primeiraData ? new Date(dto.primeiraData) : this.hojeMais(5);
    const parcelas = buildInstallments(valorAcordado, dto.parcelas, primeira);

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

      // cancela as faturas renegociadas
      await tx.invoice.updateMany({
        where: { tenantId, id: { in: dto.faturaIds } },
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
