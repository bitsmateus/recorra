import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from './prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { AuditService } from '@/common/audit/audit.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';

@Global()
@Module({
  providers: [
    PrismaService,
    CryptoService,
    AuditService,
    // Ativa a RLS por requisição quando RLS_ENFORCED=true (no-op caso contrário).
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [PrismaService, CryptoService, AuditService],
})
export class PrismaModule {}
