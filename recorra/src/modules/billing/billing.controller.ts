import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ChargeMethod } from '@prisma/client';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId, CurrentUser } from '@/common/auth/current-user.decorator';
import { AuthUser } from '@/common/auth/jwt.types';
import { SubscriptionsService } from './subscriptions.service';
import { AgreementsService } from './agreements.service';
import { Ciclo } from './recurrence';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(
    private readonly subs: SubscriptionsService,
    private readonly agreements: AgreementsService,
  ) {}

  // ---------- Assinaturas ----------
  @Get('assinaturas')
  listSubs(@TenantId() tenantId: string) {
    return this.subs.list(tenantId);
  }

  @Post('assinaturas')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  createSub(
    @TenantId() tenantId: string,
    @Body() dto: { customerId: string; plano: string; valor: number; ciclo?: Ciclo; metodo?: ChargeMethod; diaVenc?: number; splitConfig?: unknown },
  ) {
    return this.subs.create(tenantId, dto);
  }

  @Patch('assinaturas/:id/status')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  statusSub(@TenantId() tenantId: string, @Param('id') id: string, @Body('status') status: 'ATIVA' | 'PAUSADA' | 'CANCELADA') {
    return this.subs.setStatus(tenantId, id, status);
  }

  @Post('assinaturas/:id/pix-automatico')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  pixAuto(@TenantId() tenantId: string, @Param('id') id: string, @Body('authId') authId: string) {
    return this.subs.registrarPixAuto(tenantId, id, authId);
  }

  // ---------- Acordos ----------
  @Get('acordos')
  listAcordos(@TenantId() tenantId: string) {
    return this.agreements.list(tenantId);
  }

  @Get('acordos/:id')
  getAcordo(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.agreements.get(tenantId, id);
  }

  @Post('acordos')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  createAcordo(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthUser,
    @Body() dto: { customerId: string; faturaIds: string[]; descontoPct?: number; parcelas: number; primeiraData?: string; observacao?: string },
  ) {
    return this.agreements.create(tenantId, dto, actor.id);
  }

  @Patch('acordos/:id/cancelar')
  @Roles('OWNER', 'ADMIN')
  cancelAcordo(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.agreements.cancel(tenantId, id, actor.id);
  }
}
