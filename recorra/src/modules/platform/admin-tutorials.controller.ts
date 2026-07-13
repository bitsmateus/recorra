import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { TutorialTipo } from '@prisma/client';
import { PlatformGuard } from './platform.guard';
import { TutorialsService } from '@/modules/tutorials/tutorials.service';

interface TutorialBody {
  secao: string;
  titulo: string;
  tipo?: TutorialTipo;
  videoUrl?: string;
  conteudo?: string;
  ordem?: number;
  ativo?: boolean;
}

/** Gestão dos tutoriais da Central de Ajuda (superadmin). */
@Controller('admin/tutoriais')
@UseGuards(PlatformGuard)
export class AdminTutorialsController {
  constructor(private readonly tutorials: TutorialsService) {}

  @Get()
  list() {
    return this.tutorials.listAll();
  }

  @Post()
  create(@Body() dto: TutorialBody) {
    return this.tutorials.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: TutorialBody) {
    return this.tutorials.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tutorials.remove(id);
  }
}
