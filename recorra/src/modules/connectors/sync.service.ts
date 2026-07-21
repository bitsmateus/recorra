import { Injectable, Logger } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { canTransition } from '@/modules/payments/invoice-status';
import { ConnectorFactory } from './connector.factory';
import { faturasQuitadasPorAusencia } from './sync-reconcile';

/**
 * Orquestra a sincronização de um sistema de origem para o Recorrai.
 * Idempotente: dedupe de cliente por (tenant, doc) e fatura por
 * (tenant, sourceSystem, sourceExternalId). Nunca duplica.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorFactory,
  ) {}

  async syncAll(tenantId: string, integrationId: string) {
    const clientes = await this.syncCustomers(tenantId, integrationId);
    const { sincronizadas, quitadas } = await this.syncInvoices(tenantId, integrationId);
    await this.prisma.sourceIntegration.update({
      where: { id: integrationId },
      data: { ultimaSync: new Date(), status: 'ok' },
    });
    return { clientes, faturas: sincronizadas, quitadas };
  }

  async syncCustomers(tenantId: string, integrationId: string): Promise<number> {
    // Escopo por tenant: impede sincronizar integração de outro tenant (IDOR).
    const integ = await this.prisma.sourceIntegration.findFirstOrThrow({ where: { id: integrationId, tenantId } });
    const connector = await this.connectors.forIntegration(integrationId, tenantId);
    const log = await this.prisma.syncLog.create({
      data: { tenantId, integrationId, tipo: 'CLIENTES' },
    });

    let count = 0;
    let erros = 0;
    try {
      const clientes = await connector.fetchCustomers();
      for (const c of clientes) {
        if (!c.doc) continue;
        try {
          await this.prisma.customer.upsert({
            where: { tenantId_doc: { tenantId, doc: c.doc } },
            create: {
              tenantId,
              nome: c.nome,
              doc: c.doc,
              email: c.email,
              telefone: c.telefone,
              contrato: c.contrato,
              sourceSystem: integ.sistema,
              externalId: c.externalId,
            },
            update: {
              nome: c.nome,
              email: c.email,
              telefone: c.telefone,
              contrato: c.contrato,
              sourceSystem: integ.sistema,
              externalId: c.externalId,
            },
          });
          count++;
        } catch (e) {
          erros++;
          this.logger.warn(`Falha ao sincronizar cliente ${c.externalId}: ${String(e)}`);
        }
      }
    } finally {
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: { quantidade: count, erros, terminadoEm: new Date() },
      });
    }
    return count;
  }

  async syncInvoices(tenantId: string, integrationId: string): Promise<{ sincronizadas: number; quitadas: number }> {
    // Escopo por tenant: impede sincronizar integração de outro tenant (IDOR).
    const integ = await this.prisma.sourceIntegration.findFirstOrThrow({ where: { id: integrationId, tenantId } });
    const connector = await this.connectors.forIntegration(integrationId, tenantId);
    const log = await this.prisma.syncLog.create({
      data: { tenantId, integrationId, tipo: 'FATURAS' },
    });

    let count = 0;
    let erros = 0;
    let quitadas = 0;
    try {
      const faturas = await connector.fetchOpenInvoices();
      const presentes = new Set<string>();

      for (const f of faturas) {
        try {
          presentes.add(f.externalId);
          const customer = await this.prisma.customer.findFirst({
            where: { tenantId, externalId: f.customerExternalId, sourceSystem: integ.sistema },
          });
          if (!customer) continue; // cliente ainda não sincronizado

          const existing = await this.prisma.invoice.findFirst({
            where: { tenantId, sourceSystem: integ.sistema, sourceExternalId: f.externalId },
          });
          const novoStatus = f.status as InvoiceStatus;

          if (existing) {
            // Campos que sempre atualizam (valor/vencimento/dados de pagamento).
            const data: Record<string, unknown> = {
              valor: f.valor,
              vencimento: f.vencimento,
              pixCopiaCola: f.pixCopiaCola,
              boletoLinha: f.boletoLinha,
              boletoUrl: f.boletoUrl,
            };
            // Status só muda se a máquina de estados permitir — nunca reverte uma
            // fatura PAGA/CANCELADA porque o ERP ainda a reporta de outro jeito.
            if (novoStatus !== existing.status && canTransition(existing.status, novoStatus)) {
              data.status = novoStatus;
              if (novoStatus === 'PAGA') data.pagoEm = existing.pagoEm ?? new Date();
            }
            await this.prisma.invoice.update({ where: { id: existing.id }, data });
            if (data.status === 'PAGA') await this.pararDunning(tenantId, existing.id);
          } else {
            const criada = await this.prisma.invoice.create({
              data: {
                tenantId,
                customerId: customer.id,
                sourceSystem: integ.sistema,
                sourceExternalId: f.externalId,
                valor: f.valor,
                vencimento: f.vencimento,
                status: novoStatus,
                pagoEm: novoStatus === 'PAGA' ? new Date() : null,
                pixCopiaCola: f.pixCopiaCola,
                boletoLinha: f.boletoLinha,
                boletoUrl: f.boletoUrl,
              },
            });
            if (novoStatus === 'PAGA') await this.pararDunning(tenantId, criada.id);
          }
          count++;
        } catch (e) {
          erros++;
          this.logger.warn(`Falha ao sincronizar fatura ${f.externalId}: ${String(e)}`);
        }
      }

      // Conciliação por ausência: quem sumiu da lista de abertas do ERP já foi pago.
      // Só roda quando (a) o conector garante snapshot completo — senão uma fatura
      // fora do lote seria quitada por engano — e (b) o fetch trouxe algo (resposta
      // vazia não quita a base inteira).
      if (connector.snapshotCompleto && faturas.length > 0) {
        const locais = await this.prisma.invoice.findMany({
          where: { tenantId, sourceSystem: integ.sistema, status: { in: ['PENDENTE', 'VENCIDA'] } },
          select: { id: true, sourceExternalId: true, status: true },
        });
        const paraQuitar = faturasQuitadasPorAusencia(locais, presentes, faturas.length > 0);
        for (const id of paraQuitar) {
          if (await this.marcarPaga(tenantId, id)) quitadas++;
        }
        if (quitadas > 0) this.logger.log(`Conciliação por ausência (${integ.sistema}): ${quitadas} fatura(s) quitada(s)`);
      }
    } finally {
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: { quantidade: count, erros, terminadoEm: new Date() },
      });
    }
    return { sincronizadas: count, quitadas };
  }

  /** Baixa idempotente: marca PAGA e para a cobrança. Não repete se já estava paga. */
  private async marcarPaga(tenantId: string, invoiceId: string): Promise<boolean> {
    const baixa = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, status: { in: ['PENDENTE', 'VENCIDA'] } },
      data: { status: 'PAGA', pagoEm: new Date() },
    });
    if (baixa.count === 0) return false;
    await this.pararDunning(tenantId, invoiceId);
    return true;
  }

  /** Cancela disparos ainda na fila desta fatura — não cobra quem já pagou. */
  private async pararDunning(tenantId: string, invoiceId: string): Promise<void> {
    await this.prisma.messageDispatch.updateMany({
      where: { tenantId, invoiceId, status: 'FILA' },
      data: { status: 'IGNORADO', erro: 'Pagamento detectado na sincronização do ERP' },
    });
  }
}
