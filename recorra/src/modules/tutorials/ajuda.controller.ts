import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { TutorialsService } from './tutorials.service';

/** Central de Ajuda vista pelo tenant (somente leitura). */
@Controller('ajuda')
@UseGuards(JwtAuthGuard)
export class AjudaController {
  constructor(private readonly tutorials: TutorialsService) {}

  @Get()
  list(@Query('secao') secao?: string) {
    return this.tutorials.listAtivos(secao);
  }
}
