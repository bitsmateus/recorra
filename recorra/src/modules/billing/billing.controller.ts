import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ChargeMethod } from '@prisma/client';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId, CurrentUser } from '@/common/auth/current-user.decorator';
import { AuthUser } from '@/common/auth/jwt.types';
import { SubscriptionsService } from './subscriptions.service';
import { AgreementsService } from './agreements.service';
import { CreateAgreementDto } from './dto/create-agreement.dto';
import { AtualizarAcordoDto, RegistrarAcordoDto } from './dto/registro-acordo.dto';
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
    @Body() dto: CreateAgreementDto,
  ) {
    return this.agreements.create(tenantId, dto, actor.id);
  }

  /** Anota o que foi combinado com o cliente (tipo, forma de pagamento, datas, obs). Todo cobrador pode. */
  @Post('acordos/registro')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  registrarAcordo(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Body() dto: RegistrarAcordoDto) {
    return this.agreements.registrar(tenantId, dto, actor.id);
  }

  @Put('acordos/:id')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  atualizarAcordo(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: AtualizarAcordoDto) {
    return this.agreements.atualizar(tenantId, id, dto, actor.id);
  }

  /** Exclui acordo anotado; o operador só exclui os que ele registrou (conferido no serviço). */
  @Delete('acordos/:id')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERADOR')
  excluirAcordo(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.agreements.excluir(tenantId, id, { id: actor.id, role: actor.role });
  }

  @Patch('acordos/:id/cancelar')
  @Roles('OWNER', 'ADMIN')
  cancelAcordo(@TenantId() tenantId: string, @CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.agreements.cancel(tenantId, id, actor.id);
  }
}
