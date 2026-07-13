import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { TemplateCategory } from '@prisma/client';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { TemplatesService } from './templates.service';

interface TemplateBody {
  nome: string;
  corpo: string;
  idioma?: string;
  categoria?: TemplateCategory;
}

@Controller('config/templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.templates.list(tenantId);
  }

  /** Sugere a categoria (utility/marketing/auth) de um texto. */
  @Post('categorizar')
  categorizar(@Body('corpo') corpo: string) {
    return this.templates.categorizar(corpo ?? '');
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  create(@TenantId() tenantId: string, @Body() dto: TemplateBody) {
    return this.templates.create(tenantId, dto);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: TemplateBody) {
    return this.templates.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.templates.remove(tenantId, id);
  }
}
