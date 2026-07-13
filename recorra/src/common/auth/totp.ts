import { authenticator } from 'otplib';

/**
 * 2FA por TOTP (compatível com Google Authenticator, Authy, etc.).
 * Wrapper puro sobre otplib — fácil de testar.
 */

/** Gera um segredo base32 para o usuário. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** URL otpauth:// para gerar o QR Code no app autenticador. */
export function totpAuthUrl(email: string, secret: string, issuer = 'Recorra'): string {
  return authenticator.keyuri(email, issuer, secret);
}

/** Verifica um código de 6 dígitos contra o segredo. */
export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/** Gera o código atual (uso em testes/depuração). */
export function currentTotp(secret: string): string {
  return authenticator.generate(secret);
}
