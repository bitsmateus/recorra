import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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

  async create(tenantId: string, dto: CreateAgreementDto) {
    if (!dto.faturaIds?.length) throw new BadRequestException('Informe as faturas a renegociar');
    if (dto.parcelas < 1) throw new BadRequestException('Número de parcelas inválido');

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
    return this.prisma.$transaction(async (tx) => {
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
  }

  async cancel(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.agreement.update({ where: { id }, data: { status: 'CANCELADO' } });
    return { ok: true };
  }

  private hojeMais(dias: number): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dias);
    return d;
  }
}
