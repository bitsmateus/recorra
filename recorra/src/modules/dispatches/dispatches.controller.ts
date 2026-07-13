import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { TenantId } from '@/common/auth/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';

const WHATS = ['WHATSAPP_CLOUD', 'WHATSAPP_EVOLUTION', 'WHATSAPP_UAZAPI'];

@Controller('disparos')
@UseGuards(JwtAuthGuard)
export class DispatchesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Histórico paginado com filtros. */
  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('tipoCanal') tipoCanal?: string,
    @Query('channelAccountId') channelAccountId?: string,
    @Query('campanhaId') campanhaId?: string,
    @Query('q') q?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const where: any = { tenantId };
    if (status) where.status = status;
    if (channelAccountId) where.channelAccountId = channelAccountId;
    if (campanhaId) where.campaignId = campanhaId;
    if (tipoCanal === 'WHATSAPP') where.canal = { in: WHATS };
    else if (tipoCanal) where.canal = tipoCanal;
    if (q) where.customer = { OR: [{ nome: { contains: q, mode: 'insensitive' } }, { telefone: { contains: q.replace(/\D/g, '') } }] };
    if (de || ate) {
      where.createdAt = {
        ...(de ? { gte: new Date(de) } : {}),
        ...(ate ? { lte: new Date(ate + 'T23:59:59') } : {}),
      };
    }

    const take = Math.min(100, Math.max(5, Number(pageSize) || 20));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;

    const [total, rows] = await Promise.all([
      this.prisma.messageDispatch.count({ where }),
      this.prisma.messageDispatch.findMany({
        where,
        include: { customer: { select: { nome: true, telefone: true } }, channelAccount: { select: { apelido: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    // Anexa o nome da campanha (sem relação FK, mapeia manualmente).
    const campIds = [...new Set(rows.map((r) => r.campaignId).filter(Boolean) as string[])];
    const camps = campIds.length ? await this.prisma.campaign.findMany({ where: { id: { in: campIds } }, select: { id: true, nome: true } }) : [];
    const cmap = new Map(camps.map((c) => [c.id, c.nome]));

    return {
      total,
      page: Math.max(1, Number(page) || 1),
      pageSize: take,
      totalPages: Math.max(1, Math.ceil(total / take)),
      rows: rows.map((r) => ({
        id: r.id,
        canal: r.canal,
        canalNome: r.channelAccount?.apelido ?? null,
        campanha: r.campaignId ? cmap.get(r.campaignId) ?? null : null,
        conteudo: r.conteudo,
        status: r.status,
        erro: r.erro,
        enviadoEm: r.enviadoEm,
        createdAt: r.createdAt,
        cliente: r.customer?.nome ?? null,
        telefone: r.customer?.telefone ?? null,
      })),
    };
  }

  @Get('resumo')
  async resumo(@TenantId() tenantId: string) {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const [enviados, entregues, falhas, fila] = await Promise.all([
      this.prisma.messageDispatch.count({ where: { tenantId, status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] }, createdAt: { gte: inicioMes } } }),
      this.prisma.messageDispatch.count({ where: { tenantId, status: 'ENTREGUE', createdAt: { gte: inicioMes } } }),
      this.prisma.messageDispatch.count({ where: { tenantId, status: 'FALHA', createdAt: { gte: inicioMes } } }),
      this.prisma.messageDispatch.count({ where: { tenantId, status: 'FILA' } }),
    ]);
    return { enviados, entregues, falhas, fila };
  }
}
