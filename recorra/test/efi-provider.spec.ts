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
    const p = new EfiProvider({ apiKey: '' }) as unknown as { normalizeStatus: (s: string) => string };
    expect(p.normalizeStatus('ATIVA')).toBe('PENDENTE');
    expect(p.normalizeStatus('CONCLUIDA')).toBe('PAGA');
    expect(p.normalizeStatus('REMOVIDA_PELO_USUARIO_RECEBEDOR')).toBe('CANCELADA');
    expect(p.normalizeStatus('REMOVIDA_PELO_PSP')).toBe('CANCELADA');
    expect(p.normalizeStatus('QUALQUER_OUTRO')).toBe('PENDENTE');
  });
});
