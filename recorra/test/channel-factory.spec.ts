import { describe, expect, it, vi } from 'vitest';
import { ChannelFactory } from '@/modules/channels/channel.factory';

describe('ChannelFactory — conta compatível com o canal', () => {
  it('descarta accountId de outro canal e usa a conta ativa do canal solicitado', async () => {
    const contaWhatsApp = { id: 'wa-1', canal: 'WHATSAPP_CLOUD', credentials: 'wa' };
    const contaSms = { id: 'sms-1', canal: 'SMS', credentials: 'sms' };
    const findFirst = vi.fn()
      .mockResolvedValueOnce(contaWhatsApp)
      .mockResolvedValueOnce(contaSms);
    const prisma = { channelAccount: { findFirst } };
    const crypto = { decryptJson: vi.fn().mockReturnValue({ token: 'ok' }) };
    const factory = new ChannelFactory(prisma as never, crypto as never);
    const provider = { send: vi.fn() };
    const build = vi.spyOn(factory, 'build').mockReturnValue(provider as never);

    const result = await factory.forTenantChannel('tenant-1', 'SMS', 'wa-1');

    expect(result).toBe(provider);
    expect(findFirst).toHaveBeenNthCalledWith(1, { where: { id: 'wa-1', tenantId: 'tenant-1', ativo: true } });
    expect(findFirst).toHaveBeenNthCalledWith(2, { where: { tenantId: 'tenant-1', canal: 'SMS', ativo: true } });
    expect(build).toHaveBeenCalledWith('SMS', { token: 'ok' });
  });
});
