import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { TenantId } from '@/common/auth/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('resumo')
  async resumo(@TenantId() tenantId: string) {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const [inadimplencia, recuperadoMes, cobrancasAtivas, disparosMes] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'VENCIDA' },
        _sum: { valor: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'PAGA', pagoEm: { gte: inicioMes } },
        _sum: { valor: true },
        _count: true,
      }),
      this.prisma.invoice.count({ where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] } } }),
      this.prisma.messageDispatch.count({ where: { tenantId, createdAt: { gte: inicioMes } } }),
    ]);

    const inadValor = Number(inadimplencia._sum.valor ?? 0);
    const recValor = Number(recuperadoMes._sum.valor ?? 0);
    const taxaRecuperacao = inadValor + recValor > 0 ? recValor / (inadValor + recValor) : 0;

    return {
      inadimplencia: { valor: inadValor, faturas: inadimplencia._count },
      recuperadoMes: { valor: recValor, faturas: recuperadoMes._count },
      cobrancasAtivas,
      disparosMes,
      taxaRecuperacao: Math.round(taxaRecuperacao * 100),
    };
  }
}
