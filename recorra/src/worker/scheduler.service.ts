import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/common/prisma/prisma.service';
import { DunningService } from '@/modules/dunning/dunning.service';
import { DispatchService } from '@/modules/dunning/dispatch.service';
import { SubscriptionsService } from '@/modules/billing/subscriptions.service';
import { ReconciliationService } from '@/modules/payments/reconciliation.service';
import { BillingSaasService } from '@/modules/platform/billing-saas.service';
import { DispatchQueue } from '@/queue/dispatch-queue';
import { CampaignsService } from '@/modules/campaigns/campaigns.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dunning: DunningService,
    private readonly dispatch: DispatchService,
    private readonly subscriptions: SubscriptionsService,
    private readonly reconciliation: ReconciliationService,
    private readonly billingSaas: BillingSaasService,
    private readonly dispatchQueue: DispatchQueue,
    private readonly campaigns: CampaignsService,
  ) {}

  @Cron('0 2 1 * *', { timeZone: 'America/Sao_Paulo' })
  async runSaasBilling() {
    try {
      const r = await this.billingSaas.gerarTodas();
      this.logger.log(`Fechamento do SaaS: ${r.geradas} faturas (${r.competencia})`);
    } catch (e) {
      this.logger.error(`Falha no fechamento do SaaS: ${String(e)}`);
    }
  }

  @Cron('0 9 * * *', { timeZone: 'America/Sao_Paulo' })
  async runCampanhas() {
    try {
      const r = await this.campaigns.executarAgendadas();
      if (r.executadas > 0) this.logger.log(`Campanhas recorrentes: ${r.executadas} executadas`);
    } catch (e) {
      this.logger.error(`Falha nas campanhas recorrentes: ${String(e)}`);
    }
  }

  @Cron('*/30 * * * *')
  async runReconciliation() {
    const tenants = await this.prisma.tenant.findMany({ where: { ativo: true }, select: { id: true } });
    for (const t of tenants) {
      try {
        const r = await this.reconciliation.reconcileTenant(t.id);
        if (r.baixadas > 0) this.logger.log(`Conciliacao ${t.id}: ${r.baixadas} baixadas`);
      } catch (e) {
        this.logger.error(`Falha na conciliacao do tenant ${t.id}: ${String(e)}`);
      }
    }
  }

  @Cron('0 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async runSubscriptions() {
    try {
      const due = await this.subscriptions.runDue();
      const retries = await this.subscriptions.runRetries();
      this.logger.log(`Assinaturas: ${due.geradas} geradas, ${retries.retentadas} retentativas, ${retries.inadimplentes} inadimplentes`);
    } catch (e) {
      this.logger.error(`Falha nas assinaturas: ${String(e)}`);
    }
  }

  @Cron('0 9 * * *', { timeZone: 'America/Sao_Paulo' })
  async runDailyDunning() {
    const tenants = await this.prisma.tenant.findMany({ where: { ativo: true }, select: { id: true } });
    this.logger.log(`Regua diaria: ${tenants.length} tenants`);
    for (const t of tenants) {
      try {
        const r = await this.dunning.runForTenant(t.id);
        this.logger.log(`Tenant ${t.id}: ${r.enfileirados} disparos enfileirados`);
      } catch (e) {
        this.logger.error(`Falha na regua do tenant ${t.id}: ${String(e)}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async enfileirarDisparos() {
    try {
      const agora = new Date();
      const pendentes = await this.prisma.messageDispatch.findMany({
        where: { status: 'FILA', OR: [{ agendadoPara: null }, { agendadoPara: { lte: agora } }] },
        take: 1000,
        select: { id: true },
      });
      for (const p of pendentes) await this.dispatchQueue.enqueue(p.id);
      if (pendentes.length > 0) this.logger.log(`Enfileirados ${pendentes.length} disparos na fila BullMQ`);
    } catch (e) {
      this.logger.error(`Falha ao enfileirar disparos: ${String(e)}`);
    }
  }
}
