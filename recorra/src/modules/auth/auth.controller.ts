import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { CurrentUser } from '@/common/auth/current-user.decorator';
import { AuthUser } from '@/common/auth/jwt.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('google')
  google(@Body('idToken') idToken: string, @Body('codigo') codigo?: string) {
    return this.auth.loginGoogle(idToken, codigo);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.auth.refresh(refreshToken);
  }

  @Post('logout')
  logout(@Body('refreshToken') refreshToken: string) {
    return this.auth.logout(refreshToken);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('forgot-password')
  forgotPassword(@Body('email') email: string) {
    return this.auth.forgotPassword(email ?? '');
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('reset-password')
  resetPassword(@Body('token') token: string, @Body('senha') senha: string) {
    return this.auth.resetPassword(token ?? '', senha ?? '');
  }

  @Post('verify-email')
  verifyEmail(@Body('token') token: string) {
    return this.auth.verifyEmail(token);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  resend(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user.id);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  setup2fa(@CurrentUser() user: AuthUser) {
    return this.auth.setup2fa(user.id, user.email);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  enable2fa(@CurrentUser() user: AuthUser, @Body('codigo') codigo: string) {
    return this.auth.enable2fa(user.id, codigo);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  disable2fa(@CurrentUser() user: AuthUser, @Body('codigo') codigo: string) {
    return this.auth.disable2fa(user.id, codigo);
  }
}
