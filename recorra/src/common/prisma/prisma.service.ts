import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService com suporte a Row-Level Security (RLS) por tenant.
 *
 * `withTenant` abre uma transação e define a variável de sessão
 * `app.current_tenant`, usada pelas policies de RLS no Postgres como
 * SEGUNDA barreira de isolamento (a primeira é sempre o `where tenantId`
 * na aplicação). Ver prisma/rls.sql.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Executa uma função dentro de uma transação com o tenant atual definido.
   * Todas as queries feitas com o client `tx` respeitam a RLS do tenant.
   */
  async withTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      // set_config é seguro contra SQL injection (parâmetro bindado).
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      return fn(tx as unknown as PrismaClient);
    });
  }
}
