import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, firstValueFrom } from 'rxjs';
import type { Prisma } from '@prisma/client';
import { env } from '@/config/env';
import { PrismaService } from './prisma.service';
import { tenantStorage } from './tenant-context';

/**
 * Abre uma transação por requisição, define `app.current_tenant` nela e executa
 * o handler dentro do contexto de tenant — ativando a RLS como 2ª barreira.
 *
 * Só age quando `RLS_ENFORCED=true` e há tenant resolvido (JWT ou x-api-key).
 * Rotas públicas (login, webhooks) e o worker seguem sem contexto (sem RLS).
 *
 * ⚠️ Trade-off: o handler roda dentro de uma transação; chamadas HTTP externas
 * longas (gateway/ERP) mantêm a conexão aberta. Avaliar timeouts antes de ativar
 * em produção. Ver R-03 no SECURITY_AUDIT.md.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!env.RLS_ENFORCED || context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<{ user?: { tenantId?: string }; apiTenantId?: string }>();
    const tenantId = req?.user?.tenantId ?? req?.apiTenantId;
    if (!tenantId) return next.handle();

    return from(
      this.prisma.withTenant(tenantId, (tx) =>
        new Promise<unknown>((resolve, reject) => {
          tenantStorage.run({ tenantId, tx: tx as unknown as Prisma.TransactionClient }, () => {
            firstValueFrom(next.handle()).then(resolve, reject);
          });
        }),
      ),
    );
  }
}
