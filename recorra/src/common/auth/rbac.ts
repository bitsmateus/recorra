/**
 * Verificação de papel (RBAC) — função pura, sem depender do Prisma.
 * Papéis: OWNER, ADMIN, FINANCEIRO, OPERADOR, LEITURA.
 */
export type Role = 'OWNER' | 'ADMIN' | 'FINANCEIRO' | 'OPERADOR' | 'LEITURA';

/** Verdadeiro se o papel do usuário está entre os exigidos (vazio = liberado). */
export function hasRole(role: Role, required: Role[]): boolean {
  if (!required || required.length === 0) return true;
  return required.includes(role);
}

/** Hierarquia: quanto maior, mais poder. Útil para comparações "pelo menos X". */
const RANK: Record<Role, number> = {
  LEITURA: 1,
  OPERADOR: 2,
  FINANCEIRO: 3,
  ADMIN: 4,
  OWNER: 5,
};

/** Verdadeiro se `role` tem pelo menos o nível de `min`. */
export function atLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}
