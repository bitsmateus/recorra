import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/common/audit/audit.service';
import { valorComDesconto, buildInstallments } from './agreement';
import { parseDateOrThrow } from '@/common/util/parse';
import { CreateAgreementDto } from './dto/create-agreement.dto';

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
