import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { MailModule } from '@/common/mail/mail.module';

/**
 * Global para que JwtService e JwtAuthGuard fiquem disponíveis a todos os
 * módulos que usam @UseGuards(JwtAuthGuard) sem precisar reimportar.
 */
@Global()
@Module({
  imports: [JwtModule.register({}), MailModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
