import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  KioskLoginDto,
  LoginDto,
  ResetPasswordDto,
} from './dto';

const REFRESH_COOKIE = 'lms_rt';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.identifier, dto.password, {
      ip: req.ip,
      ua: req.headers['user-agent'],
    });
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  /** Shared classroom panel sign-in — device scope only. */
  @Public()
  @Post('kiosk/login')
  kioskLogin(@Body() dto: KioskLoginDto, @Req() req: Request) {
    return this.auth.kioskLogin(dto.kioskUsername, dto.kioskPassword, {
      ip: req.ip,
      ua: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
    const pair = await this.auth.refresh(token, { ip: req.ip, ua: req.headers['user-agent'] });
    setRefreshCookie(res, pair.refreshToken);
    return { accessToken: pair.accessToken };
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    // clearCookie only matches when the attributes match the ones it was set with.
    res.clearCookie(REFRESH_COOKIE, {
      path: '/api/auth',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return result;
  }

  @Public()
  @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto.identifier);
  }

  @Public()
  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.auth.me(userId);
  }

  @Post('change-password')
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
  }
}

function setRefreshCookie(res: Response, token: string) {
  // In production the portal (Vercel) and the API (Render) sit on different
  // registrable domains, so the refresh cookie travels in a third-party
  // context: it needs SameSite=None, which browsers only honour with Secure.
  const crossSite = process.env.NODE_ENV === 'production';

  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: crossSite ? 'none' : 'lax',
    secure: crossSite,
    path: '/api/auth',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}
