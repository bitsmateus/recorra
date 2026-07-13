import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { TenantId } from '@/common/auth/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';

/** Status do onboarding guiado: checklist do que falta configurar. */
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('status')
  async status(@TenantId() tenantId: string) {
    const [gateway, canal, integracao, regua, clientes] = await Promise.all([
      this.prisma.paymentProviderAccount.count({ where: { tenantId, ativo: true } }),
      this.prisma.channelAccount.count({ where: { tenantId, ativo: true } }),
      this.prisma.sourceIntegration.count({ where: { tenantId, ativo: true } }),
      this.prisma.dunningRule.count({ where: { tenantId, ativo: true } }),
      this.prisma.customer.count({ where: { tenantId } }),
    ]);

    const passos = [
      { chave: 'canal', titulo: 'Conectar um canal (WhatsApp/e-mail/SMS)', feito: canal > 0 },
      { chave: 'clientes', titulo: 'Importar clientes (CSV ou integração)', feito: clientes > 0 || integracao > 0 },
      { chave: 'gateway', titulo: 'Conectar um gateway de pagamento', feito: gateway > 0 },
      { chave: 'regua', titulo: 'Criar uma régua de cobrança', feito: regua > 0 },
    ];
    const concluido = passos.every((p) => p.feito);
    return { concluido, progresso: passos.filter((p) => p.feito).length, total: passos.length, passos };
  }
}
