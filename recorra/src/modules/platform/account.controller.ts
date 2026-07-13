import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { TenantId } from '@/common/auth/current-user.decorator';
import { BillingSaasService } from './billing-saas.service';

/** Autoatendimento do tenant: ver plano, uso e faturas da plataforma. */
@Controller('minha-conta')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly billing: BillingSaasService) {}

  @Get('plano')
  plano(@TenantId() tenantId: string) {
    return this.billing.myPlan(tenantId);
  }

  @Get('faturas')
  faturas(@TenantId() tenantId: string) {
    return this.billing.listInvoices(tenantId);
  }
}
