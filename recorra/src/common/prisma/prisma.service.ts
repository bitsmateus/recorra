import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantStorage } from './tenant-context';

/**
 * PrismaService com suporte a Row-Level Security (RLS) por tenant.
 *
 * Quando a requisição roda dentro de um contexto de tenant (ver
 * TenantContextInterceptor, ativado por `RLS_ENFORCED`), este serviço roteia
 * TODAS as queries para a transação (`tx`) onde `app.current_tenant` foi
 * definido — fazendo as policies de RLS (prisma/rls-strict.sql) valerem como
 * SEGUNDA barreira de isolamento (a primeira é sempre o `where tenantId`).
 *
 * Sem contexto ativo (RLS_ENFORCED=false, worker, webhooks), comporta-se como
 * um PrismaClient normal — nada muda.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    // Proxy: intercepta o acesso aos delegates de modelo e ao $transaction para,
    // quando houver `tx` no contexto, executar dentro dela (RLS aplicada).
    return new Proxy(this, {
      get(target, prop, receiver) {
        const store = tenantStorage.getStore();
        const tx = store?.tx as Record<string | symbol, unknown> | undefined;

        // $transaction aninhado: se já estamos numa tx com tenant, reutiliza-a
        // (evita "Transactions are not allowed to be nested").
        if (prop === '$transaction' && tx) {
          return (arg: unknown, ..._rest: unknown[]) =>
            typeof arg === 'function' ? (arg as (c: unknown) => unknown)(tx) : (tx as any).$transaction?.(arg);
        }

        // Delegates de modelo (customer, invoice, ...) → roteia para a tx.
        // Ignora internos ($..., _..., then) para não interferir no engine do Prisma.
        if (
          tx &&
          typeof prop === 'string' &&
          !prop.startsWith('$') &&
          !prop.startsWith('_') &&
          prop !== 'then' &&
          Object.prototype.hasOwnProperty.call(tx, prop)
        ) {
          return tx[prop];
        }

        return Reflect.get(target, prop, receiver);
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Executa uma função dentro de uma transação com o tenant atual definido.
   * Todas as queries feitas com o client `tx` respeitam a RLS do tenant.
   * Usado pelo interceptor e pelos fluxos do worker (fora de requisição HTTP).
   */
  async withTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      // set_config é seguro contra SQL injection (parâmetro bindado).
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      return fn(tx as unknown as PrismaClient);
    });
  }
}
