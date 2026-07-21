import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { JwtAuthGuard } from '@/common/auth/jwt-auth.guard';
import { CurrentUser } from '@/common/auth/current-user.decorator';
import { AuthUser } from '@/common/auth/jwt.types';
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from '@/common/auth/refresh-cookie';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...rest } = await this.auth.register(dto);
    setRefreshCookie(res, refreshToken);
    return rest;
  }

  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...rest } = await this.auth.login(dto);
    setRefreshCookie(res, refreshToken);
    return rest;
  }

  @Post('google')
  async google(
    @Body('idToken') idToken: string,
    @Res({ passthrough: true }) res: Response,
    @Body('codigo') codigo?: string,
  ) {
    const { refreshToken, ...rest } = await this.auth.loginGoogle(idToken, codigo);
    setRefreshCookie(res, refreshToken);
    return rest;
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('refreshToken') bodyToken?: string,
  ) {
    // Cookie httpOnly primeiro; body como fallback (frontend antigo em cache).
    const token = readRefreshCookie(req) ?? bodyToken ?? '';
    const { refreshToken, ...rest } = await this.auth.refresh(token);
    setRefreshCookie(res, refreshToken);
    return rest;
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('refreshToken') bodyToken?: string,
  ) {
    const token = readRefreshCookie(req) ?? bodyToken;
    if (token) await this.auth.logout(token);
    clearRefreshCookie(res);
    return { ok: true };
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
