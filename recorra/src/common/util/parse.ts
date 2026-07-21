import { BadRequestException } from '@nestjs/common';

/**
 * Parsing seguro de entrada do usuário. Evita que `new Date('lixo')` /
 * `Number('abc')` escorreguem para dentro de queries do Prisma e virem 500 —
 * campos obrigatórios do corpo lançam 400; filtros inválidos são ignorados.
 */

/** Converte em Date, lançando 400 se inválida. Use em campos de corpo. */
export function parseDateOrThrow(value: string, campo = 'data'): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${campo} inválida`);
  return d;
}

/** Converte em Date para filtro; undefined se ausente/inválida (filtro ignorado). */
export function parseDateFilter(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Converte em número finito; undefined se ausente/inválido. */
export function parseNumberFilter(value?: string | number | null): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
