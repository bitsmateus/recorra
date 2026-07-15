import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

/**
 * Contexto de tenant por requisição (AsyncLocalStorage).
 *
 * Guarda o tenant atual e, quando a RLS está ativa, a transação (`tx`) na qual
 * a variável de sessão `app.current_tenant` foi definida. O PrismaService roteia
 * as queries para esse `tx`, fazendo a RLS do Postgres valer como 2ª barreira.
 */
export interface TenantStore {
  tenantId: string;
  tx?: Prisma.TransactionClient;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/** Executa `fn` com o contexto de tenant ativo. */
export function runWithTenantContext<T>(store: TenantStore, fn: () => T): T {
  return tenantStorage.run(store, fn);
}

/** Tenant atual do contexto (se houver). */
export function currentTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

/** Transação com o tenant setado, se a RLS estiver ativa nesta requisição. */
export function currentTenantTx(): Prisma.TransactionClient | undefined {
  return tenantStorage.getStore()?.tx;
}
