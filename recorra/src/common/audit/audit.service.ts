import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';

export interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  /** Ação em ponto: ex. 'invoice.status.update', 'agreement.create', 'user.role.update'. */
  acao: string;
  /** Entidade afetada: ex. 'Invoice', 'Agreement', 'User'. */
  entidade: string;
  entidadeId?: string | null;
  antes?: unknown;
  depois?: unknown;
  ip?: string | null;
}

/**
 * Trilha de auditoria das ações sensíveis (quem mudou o quê).
 * Best-effort: uma falha ao gravar auditoria NUNCA interrompe o fluxo de negócio.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(e: AuditEntry): Promise<void> {
    try {
      const data: Record<string, unknown> = {
        tenantId: e.tenantId,
        userId: e.userId ?? null,
        acao: e.acao,
        entidade: e.entidade,
        entidadeId: e.entidadeId ?? null,
        ip: e.ip ?? null,
      };
      if (e.antes !== undefined) data.antes = e.antes;
      if (e.depois !== undefined) data.depois = e.depois;
      await this.prisma.auditLog.create({ data: data as never });
    } catch (err) {
      this.logger.warn(`Falha ao gravar AuditLog (${e.acao}): ${String(err)}`);
    }
  }
}
