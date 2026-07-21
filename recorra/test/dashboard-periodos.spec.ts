import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
  process.env.REDIS_URL ||= 'redis://localhost:6379';
  process.env.JWT_SECRET ||= 'dashboard-periodos-test-secret-32-bytes';
  process.env.ENCRYPTION_KEY ||= 'dashboard-periodos-test-key-32-bytesxx';
});

import { DashboardController } from '@/modules/dashboard/dashboard.controller';
import { intervaloDe } from '../../recorra-web/src/lib/periodo';

describe('presets de período do dashboard', () => {
  const hoje = new Date(2026, 6, 21, 12); // 21/07/2026 no calendário local

  it.each([
    ['7d', '2026-07-15', '2026-07-21'],
    ['15d', '2026-07-07', '2026-07-21'],
    ['30d', '2026-06-22', '2026-07-21'],
    ['90d', '2026-04-23', '2026-07-21'],
    ['mes', '2026-07-01', '2026-07-31'],
    ['mes-passado', '2026-06-01', '2026-06-30'],
    ['ano', '2026-01-01', '2026-12-31'],
  ] as const)('%s envia o intervalo correto', (chave, de, ate) => {
    expect(intervaloDe(chave, hoje)).toEqual({ de, ate });
  });

  it('calcula corretamente as viradas de mês e ano', () => {
    const janeiro = new Date(2026, 0, 3, 12);
    expect(intervaloDe('7d', janeiro)).toEqual({ de: '2025-12-28', ate: '2026-01-03' });
    expect(intervaloDe('mes-passado', janeiro)).toEqual({ de: '2025-12-01', ate: '2025-12-31' });
  });
});

describe('aplicação do período no resumo', () => {
  it('filtra inadimplência por vencimento e recuperação/disparos pela data do evento', async () => {
    const aggregate = vi.fn()
      .mockResolvedValueOnce({ _sum: { valor: 100 }, _count: 1 })
      .mockResolvedValueOnce({ _sum: { valor: 50 }, _count: 1 });
    const count = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) },
      invoice: { aggregate, count },
      messageDispatch: { count },
    };

    const controller = new DashboardController(prisma as never);
    await controller.resumo('tenant-1', '2026-07-01', '2026-07-31');

    const vencimento = {
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-31T23:59:59.999Z'),
    };
    const eventos = {
      gte: new Date('2026-07-01T03:00:00.000Z'),
      lte: new Date('2026-08-01T02:59:59.999Z'),
    };

    expect(aggregate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ vencimento }),
    }));
    expect(aggregate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ pagoEm: eventos }),
    }));
    expect(count).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ vencimento }),
    }));
    expect(count).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ createdAt: eventos }),
    }));
  });
});
