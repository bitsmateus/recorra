import { Module } from '@nestjs/common';
import { IngestModule } from '@/modules/ingest/ingest.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { UsersModule } from '@/modules/users/users.module';
import { PlatformModule } from '@/modules/platform/platform.module';
import { PublicApiGuard } from './public-api.guard';
import { PublicClientesController } from './public-clientes.controller';
import { PublicCobrancasController } from './public-cobrancas.controller';
import { PublicUsuariosController } from './public-usuarios.controller';
import { PublicTenantsController } from './public-tenants.controller';

/**
 * API pública versionada (`/api/v1/*`), autenticada por token (x-api-key) com
 * escopos. Reaproveita os serviços de domínio existentes.
 */
@Module({
  imports: [IngestModule, CustomersModule, PaymentsModule, UsersModule, PlatformModule],
  controllers: [PublicClientesController, PublicCobrancasController, PublicUsuariosController, PublicTenantsController],
  providers: [PublicApiGuard],
})
export class PublicApiModule {}
