import { Injectable, NotFoundException } from '@nestjs/common';
import { TutorialTipo } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';

interface UpsertTutorialDto {
  secao: string;
  titulo: string;
  tipo?: TutorialTipo;
  videoUrl?: string;
  conteudo?: string;
  ordem?: number;
  ativo?: boolean;
}

@Injectable()
export class TutorialsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenant: tutoriais ativos (opcionalmente por seção). */
  listAtivos(secao?: string) {
    return this.prisma.tutorial.findMany({
      where: { ativo: true, ...(secao ? { secao } : {}) },
      orderBy: [{ secao: 'asc' }, { ordem: 'asc' }],
    });
  }

  /** Superadmin: todos. */
  listAll() {
    return this.prisma.tutorial.findMany({ orderBy: [{ secao: 'asc' }, { ordem: 'asc' }] });
  }

  create(dto: UpsertTutorialDto) {
    return this.prisma.tutorial.create({
      data: {
        secao: dto.secao || 'geral',
        titulo: dto.titulo,
        tipo: dto.tipo ?? 'TEXTO',
        videoUrl: dto.videoUrl,
        conteudo: dto.conteudo,
        ordem: dto.ordem ?? 0,
        ativo: dto.ativo ?? true,
      },
    });
  }

  async update(id: string, dto: UpsertTutorialDto) {
    await this.getOrThrow(id);
    return this.prisma.tutorial.update({
      where: { id },
      data: {
        secao: dto.secao,
        titulo: dto.titulo,
        tipo: dto.tipo,
        videoUrl: dto.videoUrl,
        conteudo: dto.conteudo,
        ordem: dto.ordem,
        ativo: dto.ativo,
      },
    });
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    await this.prisma.tutorial.delete({ where: { id } });
    return { ok: true };
  }

  private async getOrThrow(id: string) {
    const t = await this.prisma.tutorial.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tutorial nao encontrado');
    return t;
  }
}
