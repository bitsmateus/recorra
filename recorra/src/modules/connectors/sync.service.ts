import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
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

  /** Um sync parado há mais que isto é considerado interrompido (queda/restart). */
  private static readonly SYNC_TRAVADO_MS = 30 * 60 * 1000;

  /**
   * Dispara a sincronização em SEGUNDO PLANO e responde na hora.
   *
   * Importar um ERP grande leva minutos — bem mais que o timeout do navegador e
   * do proxy. Rodando dentro da requisição, a tela ficava "Sincronizando..."
   * para sempre mesmo com o servidor tendo terminado. O progresso agora é lido
   * por `syncStatus`.
   */
  async iniciarSync(tenantId: string, integrationId: string) {
    await this.prisma.sourceIntegration.findFirstOrThrow({ where: { id: integrationId, tenantId } });
    const emAndamento = await this.rodando(tenantId, integrationId);
    if (emAndamento) return { iniciado: false, jaRodando: true };
    // O erro fica registrado no SyncLog/status da integração — aqui só evitamos
    // derrubar o processo com uma promise rejeitada sem dono.
    void this.syncAll(tenantId, integrationId).catch(() => undefined);
    return { iniciado: true, jaRodando: false };
  }

  /** Sync ainda em curso (ignora log preso por queda do servidor). */
  private async rodando(tenantId: string, integrationId: string) {
    const aberto = await this.prisma.syncLog.findFirst({
      where: { tenantId, integrationId, terminadoEm: null },
      orderBy: { iniciadoEm: 'desc' },
    });
    if (!aberto) return null;
    if (Date.now() - aberto.iniciadoEm.getTime() > SyncService.SYNC_TRAVADO_MS) return null;
    return aberto;
  }

  /** Progresso da sincronização para a tela acompanhar sem travar. */
  async syncStatus(tenantId: string, integrationId: string) {
    const integ = await this.prisma.sourceIntegration.findFirstOrThrow({
      where: { id: integrationId, tenantId },
      select: { status: true, ultimaSync: true },
    });
    const logs = await this.prisma.syncLog.findMany({
      where: { tenantId, integrationId },
      orderBy: { iniciadoEm: 'desc' },
      take: 4,
    });
    const resumo = (tipo: 'CLIENTES' | 'FATURAS') => {
      const l = logs.find((x) => x.tipo === tipo);
      if (!l) return null;
      return {
        quantidade: l.quantidade,
        erros: l.erros,
        detalhe: l.detalhe,
        emCurso: !l.terminadoEm,
        iniciadoEm: l.iniciadoEm,
        terminadoEm: l.terminadoEm,
      };
    };
    const emAndamento = await this.rodando(tenantId, integrationId);
    // Só reporta erro do ciclo mais recente (o log mais novo que trouxe detalhe).
    const erro = logs.find((l) => l.detalhe)?.detalhe ?? null;
    return {
      rodando: !!emAndamento,
      status: integ.status,
      ultimaSync: integ.ultimaSync,
      clientes: resumo('CLIENTES'),
      faturas: resumo('FATURAS'),
      erro: emAndamento ? null : erro,
    };
  }

  async syncAll(tenantId: string, integrationId: string) {
    try {
      const clientes = await this.syncCustomers(tenantId, integrationId);
      const { sincronizadas, quitadas } = await this.syncInvoices(tenantId, integrationId);
      await this.prisma.sourceIntegration.update({
        where: { id: integrationId },
        data: { ultimaSync: new Date(), status: 'ok' },
      });
      return { clientes, faturas: sincronizadas, quitadas };
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      this.logger.error(`Falha na sincronização da integração ${integrationId}: ${mensagem}`);
      await this.prisma.sourceIntegration.updateMany({
        where: { id: integrationId, tenantId },
        data: { status: 'falha' },
      }).catch(() => undefined);
      // Não usar HTTP 502 aqui: alguns proxies (incluindo a configuração atual
      // do EasyPanel) substituem respostas 502 e removem os cabeçalhos CORS. O
      // navegador então esconde a mensagem real e mostra apenas "Failed to
      // fetch". 422 preserva o detalhe seguro retornado pelo conector.
      throw new UnprocessableEntityException(mensagem || 'O ERP não respondeu corretamente');
    }
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
    // Guarda o motivo da falha para a tela poder mostrar (e não só 'falha').
    let detalhe: string | null = null;
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
    } catch (e) {
      detalhe = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      throw e;
    } finally {
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: { quantidade: count, erros, detalhe, terminadoEm: new Date() },
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
    // Guarda o motivo da falha para a tela poder mostrar (e não só 'falha').
    let detalhe: string | null = null;
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
    } catch (e) {
      detalhe = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      throw e;
    } finally {
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: { quantidade: count, erros, detalhe, terminadoEm: new Date() },
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
