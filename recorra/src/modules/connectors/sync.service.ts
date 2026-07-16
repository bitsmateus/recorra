import { Injectable, Logger } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ConnectorFactory } from './connector.factory';

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
    const faturas = await this.syncInvoices(tenantId, integrationId);
    await this.prisma.sourceIntegration.update({
      where: { id: integrationId },
      data: { ultimaSync: new Date(), status: 'ok' },
    });
    return { clientes, faturas };
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

  async syncInvoices(tenantId: string, integrationId: string): Promise<number> {
    // Escopo por tenant: impede sincronizar integração de outro tenant (IDOR).
    const integ = await this.prisma.sourceIntegration.findFirstOrThrow({ where: { id: integrationId, tenantId } });
    const connector = await this.connectors.forIntegration(integrationId, tenantId);
    const log = await this.prisma.syncLog.create({
      data: { tenantId, integrationId, tipo: 'FATURAS' },
    });

    let count = 0;
    let erros = 0;
    try {
      const faturas = await connector.fetchOpenInvoices();
      for (const f of faturas) {
        try {
          const customer = await this.prisma.customer.findFirst({
            where: { tenantId, externalId: f.customerExternalId, sourceSystem: integ.sistema },
          });
          if (!customer) continue; // cliente ainda não sincronizado

          const existing = await this.prisma.invoice.findFirst({
            where: { tenantId, sourceSystem: integ.sistema, sourceExternalId: f.externalId },
          });

          const data = {
            tenantId,
            customerId: customer.id,
            sourceSystem: integ.sistema,
            sourceExternalId: f.externalId,
            valor: f.valor,
            vencimento: f.vencimento,
            status: f.status as InvoiceStatus,
            pixCopiaCola: f.pixCopiaCola,
            boletoLinha: f.boletoLinha,
            boletoUrl: f.boletoUrl,
          };

          if (existing) {
            await this.prisma.invoice.update({ where: { id: existing.id }, data });
          } else {
            await this.prisma.invoice.create({ data });
          }
          count++;
        } catch (e) {
          erros++;
          this.logger.warn(`Falha ao sincronizar fatura ${f.externalId}: ${String(e)}`);
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
}
