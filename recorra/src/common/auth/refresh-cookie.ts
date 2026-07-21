import type { Request, Response } from 'express';
import { env } from '@/config/env';

/**
 * O refresh token (30 dias) vive num cookie httpOnly — fora do alcance de JS/XSS.
 * Só o access token (15 min) fica acessível ao frontend. `path` restringe o
 * envio aos endpoints de auth (login/refresh/logout), reduzindo a exposição.
 */
const NAME = 'recorra_rt';
const PATH = '/api/auth';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias (casa com JWT_REFRESH_TTL)

function cookieOpts() {
  const prod = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    // Painel e API sob o mesmo domínio registrável (ex.: app./api.recorra.com.br):
    // same-site, então SameSite=Lax basta e evita cookies de terceiros. Secure só
    // em produção (dev é HTTP em localhost).
    secure: prod,
    sameSite: 'lax' as const,
    path: PATH,
  };
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(NAME, token, { ...cookieOpts(), maxAge: MAX_AGE_MS });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(NAME, { path: PATH });
}

/** Lê o refresh token do cookie (sem cookie-parser). */
export function readRefreshCookie(req: Request): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === NAME) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}
