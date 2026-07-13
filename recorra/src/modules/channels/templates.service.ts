import { Injectable, NotFoundException } from '@nestjs/common';
import { TemplateCategory } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { categorizeTemplate, isCobrancaButMarketing } from './template-category';

interface UpsertTemplateDto {
  nome: string;
  corpo: string;
  idioma?: string;
  categoria?: TemplateCategory; // se omitido, é sugerido pela heurística
}

/** Gestão de templates HSM do WhatsApp com categorização utility/marketing. */
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.whatsAppTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async create(tenantId: string, dto: UpsertTemplateDto) {
    const categoria = dto.categoria ?? categorizeTemplate(dto.corpo);
    return this.prisma.whatsAppTemplate.create({
      data: { tenantId, nome: dto.nome, corpo: dto.corpo, idioma: dto.idioma ?? 'pt_BR', categoria },
    });
  }

  async update(tenantId: string, id: string, dto: UpsertTemplateDto) {
    await this.getOrThrow(tenantId, id);
    const categoria = dto.categoria ?? categorizeTemplate(dto.corpo);
    return this.prisma.whatsAppTemplate.update({ where: { id }, data: { nome: dto.nome, corpo: dto.corpo, categoria } });
  }

  async remove(tenantId: string, id: string) {
    await this.getOrThrow(tenantId, id);
    await this.prisma.whatsAppTemplate.delete({ where: { id } });
    return { ok: true };
  }

  /** Sugere categoria e alerta se um template de cobrança caiu em marketing (mais caro). */
  categorizar(corpo: string) {
    return { categoria: categorizeTemplate(corpo), alertaCusto: isCobrancaButMarketing(corpo) };
  }

  private async getOrThrow(tenantId: string, id: string) {
    const t = await this.prisma.whatsAppTemplate.findFirst({ where: { id, tenantId } });
    if (!t) throw new NotFoundException('Template não encontrado');
    return t;
  }
}
