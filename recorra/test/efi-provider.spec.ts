import { describe, expect, it } from 'vitest';
import { EfiProvider } from '@/modules/payments/providers/efi.provider';

/**
 * Efí exige mTLS + OAuth2. Estes testes travam o contrato de credenciais e o
 * mapeamento de status SEM tocar a rede: quando falta certificado ou
 * client_id/secret, o provider falha cedo com mensagem clara (antes de qualquer
 * chamada HTTP). Também confirma retrocompatibilidade do formato legado.
 */
describe('EfiProvider — credenciais e mTLS', () => {
  it('suporta importação e se declara EFI', () => {
    const p = new EfiProvider({ apiKey: '' });
    expect(p.type).toBe('EFI');
    expect(p.supportsImport()).toBe(true);
  });

  it('falha com mensagem clara quando não há client_id/secret', async () => {
    const p = new EfiProvider({ apiKey: '', certBase64: 'Zm9v' });
    await expect(p.testConnection()).rejects.toThrow(/client_id\/client_secret/);
  });

  it('falha com mensagem clara quando não há certificado (mTLS)', async () => {
    // client_id/secret presentes, mas sem certificado.
    const p = new EfiProvider({ apiKey: '', clientId: 'id', clientSecret: 'secret' });
    await expect(p.testConnection()).rejects.toThrow(/certificado \(mTLS\)/);
  });

  it('aceita o formato legado apiKey "id:secret" (retrocompat)', async () => {
    // Legado tinha id:secret em apiKey e nenhum certificado — deve reclamar do
    // certificado (ou seja, as credenciais foram lidas do formato antigo).
    const p = new EfiProvider({ apiKey: 'meu_id:meu_secret' });
    await expect(p.testConnection()).rejects.toThrow(/certificado \(mTLS\)/);
  });

  it('normaliza status Pix da Efí para o vocabulário interno', () => {
    const p = new EfiProvider({ apiKey: '' }) as unknown as { normalizeStatusPix: (s: string) => string };
    expect(p.normalizeStatusPix('ATIVA')).toBe('PENDENTE');
    expect(p.normalizeStatusPix('CONCLUIDA')).toBe('PAGA');
    expect(p.normalizeStatusPix('REMOVIDA_PELO_USUARIO_RECEBEDOR')).toBe('CANCELADA');
    expect(p.normalizeStatusPix('REMOVIDA_PELO_PSP')).toBe('CANCELADA');
    expect(p.normalizeStatusPix('QUALQUER_OUTRO')).toBe('PENDENTE');
  });

  it('normaliza status de boleto (API de Cobranças) para o vocabulário interno', () => {
    const p = new EfiProvider({ apiKey: '' }) as unknown as { normalizeStatusBoleto: (s: string) => string };
    expect(p.normalizeStatusBoleto('paid')).toBe('PAGA');
    expect(p.normalizeStatusBoleto('settled')).toBe('PAGA');
    expect(p.normalizeStatusBoleto('canceled')).toBe('CANCELADA');
    expect(p.normalizeStatusBoleto('expired')).toBe('CANCELADA');
    expect(p.normalizeStatusBoleto('refunded')).toBe('ESTORNADA');
    expect(p.normalizeStatusBoleto('waiting')).toBe('PENDENTE');
    expect(p.normalizeStatusBoleto('new')).toBe('PENDENTE');
  });

  it('roteia por formato de id: boleto (numérico) vs Pix (txid alfanumérico)', () => {
    const p = new EfiProvider({ apiKey: '' }) as unknown as { ehBoleto: (id: string) => boolean };
    expect(p.ehBoleto('123456')).toBe(true);
    expect(p.ehBoleto('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5')).toBe(false);
  });

  it('getPixCopiaCola de um id de boleto é no-op (retorna null sem tocar a rede)', async () => {
    const p = new EfiProvider({ apiKey: '' });
    expect(await p.getPixCopiaCola('987654')).toBeNull();
  });

  it('registrar webhook exige chave Pix configurada', async () => {
    const p = new EfiProvider({ apiKey: 'id:secret', certBase64: 'Zm9v' });
    await expect(p.registerWebhook('https://x/webhooks/EFI/1')).rejects.toThrow(/chave Pix/);
  });
});
