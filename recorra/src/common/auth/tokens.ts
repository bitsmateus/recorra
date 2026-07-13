import { randomBytes, createHash } from 'node:crypto';

/**
 * Helpers puros de token (verificação de e-mail, convite, refresh).
 * Sem dependência de framework/banco — fáceis de testar.
 */

/** Gera um token opaco aleatório (hex). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Hash SHA-256 para guardar tokens no banco (nunca guardar o token puro). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Data de expiração daqui a N minutos. */
export function expiresInMinutes(minutes: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + minutes * 60_000);
}

/** Data de expiração daqui a N dias. */
export function expiresInDays(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/** Verdadeiro se a data é nula ou já passou. */
export function isExpired(exp: Date | null | undefined, now: Date = new Date()): boolean {
  if (!exp) return true;
  return exp.getTime() <= now.getTime();
}

/** Comparação em tempo constante de dois hashes (evita timing attacks). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
