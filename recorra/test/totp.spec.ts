import { describe, it, expect } from 'vitest';
import { generateTotpSecret, totpAuthUrl, verifyTotp, currentTotp } from '@/common/auth/totp';

describe('TOTP (2FA)', () => {
  it('gera segredo base32 não vazio', () => {
    const s = generateTotpSecret();
    expect(s.length).toBeGreaterThan(10);
  });

  it('verifica o código atual gerado pelo próprio segredo', () => {
    const secret = generateTotpSecret();
    const code = currentTotp(secret);
    expect(verifyTotp(code, secret)).toBe(true);
  });

  it('rejeita código inválido', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp('000000', secret)).toBe(false);
  });

  it('monta otpauth URL com issuer e conta', () => {
    const secret = generateTotpSecret();
    const url = totpAuthUrl('user@demo.com', secret, 'Recorrai');
    expect(url).toContain('otpauth://totp/');
    expect(url).toContain('Recorrai');
    expect(url).toContain('secret=');
  });
});
