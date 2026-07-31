import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { randomToken, hashToken } from '@/common/auth/tokens';
import { isScopeValido, scopesPermitidos } from '@/modules/public-api/scopes';

export interface ApiKeyContexto {
  id: string;
  tenantId: string | null;
  tipo: 'TENANT' | 'PLATFORM';
  scopes: string[];
}

/** Gestão de API keys (tokens da API pública). Guarda apenas o hash da chave. */
@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria um token. `tenantId` nulo = token de PLATAFORMA (superadmin). Valida que
   * os escopos existem e são permitidos para o tipo (tenant não recebe escopo de
   * plataforma). Retorna a chave PURA só nesta resposta — nunca mais é exibida.
   */
  async create(
    tenantId: string | null,
    nome: string,
    opts: { scopes?: string[]; expiraEm?: string | Date | null } = {},
  ) {
    const tipo = tenantId ? 'TENANT' : 'PLATFORM';
    const permitidos = new Set(scopesPermitidos(tipo));
    const scopes = [...new Set(opts.scopes ?? [])];
    for (const s of scopes) {
      if (!isScopeValido(s)) throw new BadRequestException(`Escopo inválido: ${s}`);
      if (!permitidos.has(s)) throw new BadRequestException(`Escopo "${s}" não é permitido para token de ${tipo === 'TENANT' ? 'tenant' : 'plataforma'}.`);
    }
    if (!scopes.length) throw new BadRequestException('Selecione ao menos um escopo (permissão) para o token.');
    const expiraEm = opts.expiraEm ? new Date(opts.expiraEm) : null;
    if (expiraEm && Number.isNaN(expiraEm.getTime())) throw new BadRequestException('Data de expiração inválida.');

    const raw = `rec_${randomToken(24)}`;
    const prefixo = raw.slice(0, 12);
    await this.prisma.apiKey.create({
      data: { tenantId, nome, prefixo, keyHash: hashToken(raw), tipo, scopes, expiraEm },
    });
    return { nome, prefixo, tipo, scopes, expiraEm, apiKey: raw };
  }

  /** Lista tokens de um tenant (ou os de plataforma, quando tenantId = null). */
  async list(tenantId: string | null) {
    const rows = await this.prisma.apiKey.findMany({
      where: { tenantId: tenantId ?? null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ keyHash, ...r }) => {
      void keyHash;
      return r;
    });
  }

  async revoke(tenantId: string | null, id: string) {
    await this.prisma.apiKey.updateMany({ where: { id, tenantId: tenantId ?? null }, data: { ativo: false } });
    return { ok: true };
  }

  /** Resolve o token completo (usado pelo PublicApiGuard). Valida ativo e expiração. */
  async resolve(rawKey: string): Promise<ApiKeyContexto> {
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash: hashToken(rawKey) } });
    if (!key || !key.ativo) throw new UnauthorizedException('API key inválida');
    if (key.expiraEm && key.expiraEm.getTime() < Date.now()) throw new UnauthorizedException('API key expirada');
    await this.prisma.apiKey.update({ where: { id: key.id }, data: { ultimoUso: new Date() } });
    return { id: key.id, tenantId: key.tenantId, tipo: key.tipo === 'PLATFORM' ? 'PLATFORM' : 'TENANT', scopes: key.scopes };
  }

  /** Compat: ingestão antiga só precisa do tenant. */
  async resolveTenant(rawKey: string): Promise<string> {
    const ctx = await this.resolve(rawKey);
    if (!ctx.tenantId) throw new UnauthorizedException('Token de plataforma não pode ingerir dados de tenant');
    return ctx.tenantId;
  }
}
