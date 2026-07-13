import { Module } from '@nestjs/common';
import { BillingSaasService } from './billing-saas.service';

/**
 * Módulo isolado do billing do SaaS (só depende do Prisma global).
 * Permite que o worker gere faturas sem puxar o PlatformService (que usa JWT).
 */
@Module({
  providers: [BillingSaasService],
  exports: [BillingSaasService],
})
export class BillingSaasModule {}
