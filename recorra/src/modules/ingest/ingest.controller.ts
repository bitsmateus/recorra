import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '@/common/prisma/prisma.service';
import { onlyDigits } from '@/common/util/normalize';
import { isValidCpfCnpj, isValidEmail, toE164BR } from '@/common/util/validators';
import { ApiKeyGuard } from './api-key.guard';

interface IngestCustomer {
  nome: string;
  doc: string;
  email?: string;
  telefone?: string;
  contrato?: string;
  externalId?: string;
}
interface IngestInvoice {
  doc: string; // documento do cliente
  externalId?: string;
  valor: number;
  vencimento: string;
  pixCopiaCola?: string;
  boletoLinha?: string;
  boletoUrl?: string;
}

/**
 * Ingestão externa via API (para quem tem sistema próprio).
 * Autenticação por `x-api-key`. Idempotente por documento/externalId.
 *
 * POST /api/ingest/clientes   { clientes: [...] }
 * POST /api/ingest/faturas    { faturas: [...] }
 */
@Controller('ingest')
@UseGuards(ApiKeyGuard)
export class IngestController {
  constructor(private readonly prisma: PrismaService) {}

  private tenant(req: Request): string {
    return (req as Request & { apiTenantId: string }).apiTenantId;
  }

  @Post('clientes')
  async clientes(@Req() req: Request, @Body('clientes') clientes: IngestCustomer[]) {
    const tenantId = this.tenant(req);
    if (clientes != null && !Array.isArray(clientes)) {
      throw new BadRequestException('`clientes` deve ser uma lista');
    }
    const lista = Array.isArray(clientes) ? clientes : [];
    let ok = 0;
    const erros: string[] = [];
    for (const c of lista) {
      if (!c || typeof c !== 'object') {
        erros.push('item inválido');
        continue;
      }
      if (!c.nome || typeof c.nome !== 'string') {
        erros.push(`nome ausente para doc ${c.doc ?? '?'}`);
        continue;
      }
      const doc = onlyDigits(c.doc);
      if (!isValidCpfCnpj(doc)) {
        erros.push(`doc inválido: ${c.doc}`);
        continue;
      }
      if (c.email && !isValidEmail(c.email)) {
        erros.push(`e-mail inválido: ${c.email}`);
        continue;
      }
      await this.prisma.customer.upsert({
        where: { tenantId_doc: { tenantId, doc } },
        create: {
          tenantId,
          nome: c.nome,
          doc,
          email: c.email || null,
          telefone: c.telefone ? toE164BR(c.telefone) : null,
          contrato: c.contrato || null,
          sourceSystem: 'API',
          externalId: c.externalId,
        },
        update: {
          nome: c.nome,
          email: c.email || undefined,
          telefone: c.telefone ? toE164BR(c.telefone) ?? undefined : undefined,
          contrato: c.contrato || undefined,
          externalId: c.externalId,
        },
      });
      ok++;
    }
    return { recebidos: lista.length, processados: ok, erros };
  }

  @Post('faturas')
  async faturas(@Req() req: Request, @Body('faturas') faturas: IngestInvoice[]) {
    const tenantId = this.tenant(req);
    if (faturas != null && !Array.isArray(faturas)) {
      throw new BadRequestException('`faturas` deve ser uma lista');
    }
    const lista = Array.isArray(faturas) ? faturas : [];
    let ok = 0;
    const erros: string[] = [];
    for (const f of lista) {
      if (!f || typeof f !== 'object') {
        erros.push('item inválido');
        continue;
      }
      const doc = onlyDigits(f.doc);
      const customer = await this.prisma.customer.findUnique({ where: { tenantId_doc: { tenantId, doc } } });
      if (!customer) {
        erros.push(`cliente não encontrado: ${f.doc}`);
        continue;
      }
      const vencimento = new Date(f.vencimento);
      if (Number.isNaN(vencimento.getTime())) {
        erros.push(`vencimento inválido para doc ${f.doc}: ${f.vencimento}`);
        continue;
      }
      const valor = Number(f.valor);
      if (!Number.isFinite(valor) || valor <= 0) {
        erros.push(`valor inválido para doc ${f.doc}: ${f.valor}`);
        continue;
      }
      const existing = f.externalId
        ? await this.prisma.invoice.findFirst({ where: { tenantId, sourceSystem: 'API', sourceExternalId: f.externalId } })
        : null;

      const data = {
        tenantId,
        customerId: customer.id,
        sourceSystem: 'API' as const,
        sourceExternalId: f.externalId,
        valor,
        vencimento,
        status: (vencimento < new Date() ? 'VENCIDA' : 'PENDENTE') as 'VENCIDA' | 'PENDENTE',
        pixCopiaCola: f.pixCopiaCola,
        boletoLinha: f.boletoLinha,
        boletoUrl: f.boletoUrl,
      };
      if (existing) await this.prisma.invoice.update({ where: { id: existing.id }, data });
      else await this.prisma.invoice.create({ data });
      ok++;
    }
    return { recebidas: lista.length, processadas: ok, erros };
  }
}
