import { describe, it, expect, vi } from 'vitest';
import { SyncService } from '@/modules/connectors/sync.service';
import { ChargesService } from '@/modules/payments/charges.service';

/**
 * PoC de segurança — Fase 8 (IDOR cross-tenant).
 * Testes descrevem o comportamento SEGURO: uma operação que referencia um
 * recurso (integração / conta de gateway) de OUTRO tenant deve ser REJEITADA.
 * Eles FALHAM hoje (F2-2 e F2-3): a operação resolve com sucesso, provando o
 * acesso cross-tenant. Devem PASSAR após escopar as queries por tenantId.
 */

describe('[F2-2] Sync não pode tocar integração de outro tenant', () => {
  it('syncAll(tenantAtacante, integracaoDaVitima) deve ser rejeitado', async () => {
    // Integração pertence ao tenant-B; o atacante autentica como tenant-A.
    const integracaoDaVitima = { id: 'int-B', tenantId: 'tenant-B', sistema: 'IXC', ativo: true };

    // Fake que imita o Prisma: findUnique (sem tenant) sempre acha;
    // findFirst/findFirstOrThrow (com tenant) só acha se o tenantId bater.
    const acha = (where: { tenantId?: string }) =>
      !where.tenantId || where.tenantId === integracaoDaVitima.tenantId ? integracaoDaVitima : null;
    const prisma = {
      sourceIntegration: {
        findUniqueOrThrow: vi.fn(async () => integracaoDaVitima),
        findFirst: vi.fn(async ({ where }: { where: { tenantId?: string } }) => acha(where)),
        findFirstOrThrow: vi.fn(async ({ where }: { where: { tenantId?: string } }) => {
          const r = acha(where);
          if (!r) throw new Error('NotFound');
          return r;
        }),
        update: vi.fn(async () => integracaoDaVitima),
      },
      syncLog: { create: vi.fn(async () => ({ id: 'log1' })), update: vi.fn(async () => ({})) },
      customer: { upsert: vi.fn(async () => ({ id: 'c1' })), findFirst: vi.fn(async () => null) },
      invoice: { findFirst: vi.fn(async () => null), update: vi.fn(), create: vi.fn() },
    };
    const connectors = {
      forIntegration: vi.fn(async () => ({
        fetchCustomers: async () => [],
        fetchOpenInvoices: async () => [],
      })),
    };

    const sync = new SyncService(prisma as never, connectors as never);

    // Hoje: resolve (importa dados da vítima). Esperado seguro: rejeitar.
    await expect(sync.syncAll('tenant-A', 'int-B')).rejects.toThrow();
  });
});

describe('[F2-3] Gerar cobrança não pode usar conta de gateway de outro tenant', () => {
  it('gerarCobranca com accountId de outro tenant deve ser rejeitado', async () => {
    const invoiceA = {
      id: 'inv-A',
      tenantId: 'tenant-A',
      valor: 100,
      vencimento: new Date('2026-08-10'),
      descricao: null,
      customer: { nome: 'Cliente A', doc: '39053344705', email: null, telefone: null },
    };
    const accountDaVitima = { id: 'acc-B', tenantId: 'tenant-B', provider: 'ASAAS' };

    const prisma = {
      tenant: { findUniqueOrThrow: vi.fn(async () => ({ plano: 'ENTERPRISE', featureFlags: { cobranca: true } })) },
      invoice: { findFirst: vi.fn(async () => invoiceA), update: vi.fn(async (a: unknown) => a) },
      paymentProviderAccount: {
        findUniqueOrThrow: vi.fn(async () => accountDaVitima),
        findFirst: vi.fn(async () => null),
      },
    };
    const factory = {
      forAccount: vi.fn(async () => ({ createCharge: vi.fn(async () => ({ externalId: 'ext_1' })) })),
    };

    const audit = { record: async () => undefined };
    const charges = new ChargesService(prisma as never, factory as never, audit as never);

    // Hoje: resolve usando as credenciais do tenant-B. Esperado seguro: rejeitar.
    await expect(charges.gerarCobranca('tenant-A', 'inv-A', 'acc-B', 'PIX')).rejects.toThrow();
  });
});
