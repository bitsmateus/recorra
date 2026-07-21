import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChargesService } from '@/modules/payments/charges.service';

describe('política de importação do gateway', () => {
  afterEach(() => vi.useRealTimers());

  function service(payments: Array<{ status: string; valor: number; vencimento: Date }>) {
    const prisma = {
      paymentProviderAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: 'acc-1', tenantId: 'tenant-1', importLookbackDays: 30 }),
      },
    };
    const provider = {
      supportsImport: () => true,
      listPayments: vi.fn().mockResolvedValue(payments),
    };
    const factory = { forAccount: vi.fn().mockResolvedValue(provider) };
    return new ChargesService(prisma as never, factory as never, {} as never);
  }

  it('separa vencidas antigas como legado usando a janela escolhida', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00Z'));
    const svc = service([
      { status: 'VENCIDA', valor: 100, vencimento: new Date('2026-07-10T00:00:00Z') },
      { status: 'VENCIDA', valor: 200, vencimento: new Date('2026-05-01T00:00:00Z') },
      { status: 'PENDENTE', valor: 300, vencimento: new Date('2026-08-10T00:00:00Z') },
      { status: 'PAGA', valor: 999, vencimento: new Date('2026-07-01T00:00:00Z') },
    ]);

    const previa = await svc.previaImportacaoGateway('tenant-1', 'acc-1', 30);

    expect(previa.total).toEqual({ quantidade: 3, valor: 600 });
    expect(previa.ativas).toEqual({ quantidade: 2, valor: 400 });
    expect(previa.legado).toEqual({ quantidade: 1, valor: 200 });
  });

  it('aceita importar todas as cobranças abertas', async () => {
    const svc = service([{ status: 'VENCIDA', valor: 50, vencimento: new Date('2020-01-01T00:00:00Z') }]);
    const previa = await svc.previaImportacaoGateway('tenant-1', 'acc-1', null);
    expect(previa.ativas.quantidade).toBe(1);
    expect(previa.legado.quantidade).toBe(0);
  });
});
