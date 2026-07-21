import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/common/prisma/prisma.service';
import { DunningService } from '@/modules/dunning/dunning.service';
import { DispatchService } from '@/modules/dunning/dispatch.service';
import { SubscriptionsService } from '@/modules/billing/subscriptions.service';
import { ReconciliationService } from '@/modules/payments/reconciliation.service';
import { ChargesService } from '@/modules/payments/charges.service';
import { BillingSaasService } from '@/modules/platform/billing-saas.service';
import { DispatchQueue } from '@/queue/dispatch-queue';
import { CampaignsService } from '@/modules/campaigns/campaigns.service';
import { SyncService } from '@/modules/connectors/sync.service';

@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dunning: DunningService,
    private readonly dispatch: DispatchService,
    private readonly subscriptions: SubscriptionsService,
    private readonly reconciliation: ReconciliationService,
    private readonly charges: ChargesService,
    private readonly billingSaas: BillingSaasService,
    private readonly dispatchQueue: DispatchQueue,
    private readonly campaigns: CampaignsService,
    private readonly sync: SyncService,
  ) {}

  /** Ao subir o worker, zera o acúmulo de faturas vencidas de uma vez (não espera as 3h). */
  async onApplicationBootstrap() {
    await this.marcarVencidas();
  }

  /**
   * Marca como VENCIDA toda fatura PENDENTE cujo vencimento já passou. Roda cedo,
   * antes da régua das 9h, para a cobrança enxergar o status certo.
   *
   * Independe do gateway (que pode continuar reportando "pendente" numa fatura já
   * vencida) — e é seguro: a reconciliação só espelha PAGA/VENCIDA e nunca reverte
   * VENCIDA para PENDENTE. Fatura que vence HOJE continua pendente (só vira vencida
   * no dia seguinte). Borda em UTC, igual ao vencimento gravado à meia-noite UTC.
   */
  @Cron('0 3 * * *', { timeZone: 'America/Sao_Paulo' })
  async marcarVencidas() {
    try {
      const n = new Date();
      const hojeUtc = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
      const r = await this.prisma.invoice.updateMany({
        where: { status: 'PENDENTE', vencimento: { lt: hojeUtc } },
        data: { status: 'VENCIDA' },
      });
      if (r.count > 0) this.logger.log(`Faturas marcadas como vencidas: ${r.count}`);
    } catch (e) {
      this.logger.error(`Falha ao marcar vencidas: ${String(e)}`);
    }
  }

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

  /**
   * Importação diária dos gateways: puxa cobranças novas "a receber" (ex.: mensalidades
   * geradas por assinaturas criadas no próprio gateway). É a rede de segurança do webhook
   * em tempo real. Agnóstico ao gateway — só age nos que suportam importação (hoje, Asaas);
   * os demais lançam "não suporta importação" e são pulados silenciosamente.
   */
  @Cron('0 6 * * *', { timeZone: 'America/Sao_Paulo' })
  async runGatewayImport() {
    const contas = await this.prisma.paymentProviderAccount.findMany({
      where: { ativo: true },
      select: { id: true, tenantId: true, provider: true, importLookbackDays: true },
    });
    for (const acc of contas) {
      try {
        const r = await this.charges.importarDoGateway(acc.tenantId, acc.id, { lookbackDays: acc.importLookbackDays });
        if (r.faturas > 0 || r.faturasAtualizadas > 0) {
          this.logger.log(`Import gateway ${acc.provider} (${acc.id}): ${r.faturas} novas, ${r.faturasAtualizadas} atualizadas`);
        }
      } catch {
        // Gateways sem suporte a importação (MP/Stripe/Efí/bancos) caem aqui — ignora.
      }
    }
  }

  /**
   * Sincronização automática dos ERPs (a cada 4h). Puxa clientes + faturas em
   * aberto e concilia quem já pagou (some da lista de abertas → baixa e para a
   * régua). É o que mantém o cliente que NÃO usa gateway com dados frescos, sem
   * depender de clicar "Sincronizar". Só conectores de pull (CSV/API têm fluxo
   * próprio); falha de um ERP não afeta os demais.
   */
  @Cron('0 */4 * * *', { timeZone: 'America/Sao_Paulo' })
  async runErpSync() {
    const integracoes = await this.prisma.sourceIntegration.findMany({
      where: { ativo: true, sistema: { in: ['IXC', 'SGP', 'HUBSOFT', 'VOALLE', 'MKAUTH'] } },
      select: { id: true, tenantId: true, sistema: true },
    });
    for (const it of integracoes) {
      try {
        const r = await this.sync.syncAll(it.tenantId, it.id);
        this.logger.log(`Sync ERP ${it.sistema} (${it.id}): ${r.clientes} clientes, ${r.faturas} faturas, ${r.quitadas} quitadas`);
      } catch (e) {
        this.logger.error(`Falha no sync ERP ${it.sistema} (${it.id}): ${String(e)}`);
        await this.prisma.sourceIntegration.update({ where: { id: it.id }, data: { status: 'falha' } }).catch(() => {});
      }
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
