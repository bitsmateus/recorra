import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { randomToken, hashToken } from '@/common/auth/tokens';

/** Gestão de API keys por tenant (ingestão externa). Guarda apenas o hash. */
@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, nome: string) {
    const raw = `rec_${randomToken(24)}`;
    const prefixo = raw.slice(0, 12);
    await this.prisma.apiKey.create({
      data: { tenantId, nome, prefixo, keyHash: hashToken(raw) },
    });
    // Retorna a chave PURA só nesta resposta — nunca mais é exibida.
    return { nome, prefixo, apiKey: raw };
  }

  async list(tenantId: string) {
    const rows = await this.prisma.apiKey.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return rows.map(({ keyHash, ...r }) => {
      void keyHash;
      return r;
    });
  }

  async revoke(tenantId: string, id: string) {
    await this.prisma.apiKey.updateMany({ where: { id, tenantId }, data: { ativo: false } });
    return { ok: true };
  }

  /** Resolve o tenant a partir da chave (usado pelo guard). */
  async resolveTenant(rawKey: string): Promise<string> {
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash: hashToken(rawKey) } });
    if (!key || !key.ativo) throw new UnauthorizedException('API key inválida');
    await this.prisma.apiKey.update({ where: { id: key.id }, data: { ultimoUso: new Date() } });
    return key.tenantId;
  }
}
