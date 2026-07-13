import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';

/**
 * Fornece JwtService/JwtAuthGuard de forma global no processo do WORKER,
 * para que os módulos importados (que têm controllers com @UseGuards) resolvam
 * suas dependências mesmo sem a AuthModule completa.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class WorkerAuthModule {}
