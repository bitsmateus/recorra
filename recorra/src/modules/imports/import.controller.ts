import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { RolesGuard } from '@/common/auth/roles.guard';
import { Roles } from '@/common/auth/roles.decorator';
import { TenantId } from '@/common/auth/current-user.decorator';
import { ImportService } from './import.service';

@Controller('clientes/importar')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post('csv')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  importCsv(@TenantId() tenantId: string, @Body('csv') csv: string) {
    return this.imports.importCsv(tenantId, csv ?? '');
  }

  @Post('excel')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  importXlsx(@TenantId() tenantId: string, @Body('xlsx') xlsx: string) {
    return this.imports.importXlsx(tenantId, xlsx ?? '');
  }

  @Post('preview')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  preview(@TenantId() tenantId: string, @Body('data') data: string) {
    return this.imports.preview(data ?? '');
  }

  @Post('aplicar')
  @Roles('OWNER', 'ADMIN', 'FINANCEIRO')
  aplicar(
    @TenantId() tenantId: string,
    @Body('data') data: string,
    @Body('mapping') mapping: Record<string, string>,
    @Body('ddi') ddi?: string,
    @Body('ddd') ddd?: string,
    @Body('etiquetas') etiquetas?: string[],
    @Body('criarCobrancas') criarCobrancas?: boolean,
  ) {
    return this.imports.importMapeado(tenantId, { data, mapping: mapping ?? {}, ddi, ddd, etiquetas, criarCobrancas });
  }
}
