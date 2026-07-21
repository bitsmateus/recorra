import { describe, expect, it, vi } from 'vitest';
import { DispatchService } from '@/modules/dunning/dispatch.service';

function dispatch(cadeiaCanais = ['WHATSAPP_CLOUD', 'EMAIL', 'SMS']) {
  return {
    id: 'dispatch-1', tenantId: 'tenant-1', customerId: 'customer-1',
    canal: 'WHATSAPP_CLOUD', cadeiaCanais, tentativaFallback: 0,
    // conta específica do canal ANTERIOR: precisa ser zerada ao trocar de canal,
    // senão o envio sairia pela conta/provedor errado.
    channelAccountId: 'conta-whatsapp-1',
    status: 'FILA', templateName: 'cobranca', templateParams: [],
    customer: { telefone: '+5511999999999', email: 'cliente@example.com' },
  };
}

describe('DispatchService — fallback e opt-out', () => {
  it('usa o primeiro fallback permitido quando o canal principal já está revogado', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      messageDispatch: { findUnique: vi.fn().mockResolvedValue(dispatch()), update },
      consent: { findFirst: vi.fn(({ where }) => Promise.resolve(where.canal === 'WHATSAPP_CLOUD' ? { id: 'revogado' } : null)) },
    };
    const service = new DispatchService(prisma as never, {} as never);

    await expect(service.processOne('dispatch-1')).rejects.toThrow('fallback: opt-out');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'dispatch-1' },
      // channelAccountId ZERADO: o envio no novo canal usa a conta padrão dele,
      // não a conta do canal anterior (WhatsApp).
      data: expect.objectContaining({ canal: 'EMAIL', channelAccountId: null, tentativaFallback: 1, status: 'FILA' }),
    }));
  });

  it('pula um fallback revogado e escolhe o próximo canal permitido', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      messageDispatch: { findUnique: vi.fn().mockResolvedValue(dispatch()), update },
      consent: { findFirst: vi.fn(({ where }) => Promise.resolve(
        where.canal === 'WHATSAPP_CLOUD' || where.canal === 'EMAIL' ? { id: 'revogado' } : null,
      )) },
    };
    const service = new DispatchService(prisma as never, {} as never);

    await expect(service.processOne('dispatch-1')).rejects.toThrow('fallback: opt-out');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ canal: 'SMS', channelAccountId: null, tentativaFallback: 2 }),
    }));
  });
});
