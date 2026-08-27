import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Patch,
  Post,
  Get,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import { CurrentUserResponseDto } from './dto/current-user-response.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private readCookie(request: Request, name: string): string | undefined {
    const prefix = `${name}=`;
    return String(request.headers.cookie || '')
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length);
  }

  private cookieOptions() {
    const production = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: production,
      sameSite: 'lax' as const,
      // The same cookie also authenticates the secured Socket.IO handshake.
      path: '/',
    };
  }

  private setSessionCookies(response: Response, tokens: { accessToken: string; refreshToken?: string }) {
    const options = this.cookieOptions();
    // Remove the legacy scoped CSRF cookie before issuing the root-scoped one;
    // otherwise browsers can send two values with the same name to /api.
    response.clearCookie('aulia_csrf_token', { httpOnly: false, secure: options.secure, sameSite: options.sameSite, path: '/api' });
    response.cookie('aulia_access_token', tokens.accessToken, {
      ...options,
      maxAge: 15 * 60 * 1000,
    });
    if (tokens.refreshToken) {
      response.cookie('aulia_refresh_token', tokens.refreshToken, {
        ...options,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    this.setCsrfCookie(response);
  }

  private setCsrfCookie(response: Response) {
    const options = this.cookieOptions();
    response.cookie('aulia_csrf_token', randomBytes(32).toString('hex'), {
      httpOnly: false,
      secure: options.secure,
      sameSite: options.sameSite,
      // It remains a non-secret anti-CSRF value. Root scope lets the SPA know
      // that a cookie session exists before attempting a refresh.
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearSessionCookies(response: Response) {
    const options = this.cookieOptions();
    response.clearCookie('aulia_access_token', options);
    response.clearCookie('aulia_refresh_token', options);
    response.clearCookie('aulia_csrf_token', {
      httpOnly: false,
      secure: options.secure,
      sameSite: options.sameSite,
      path: '/',
    });
    response.clearCookie('aulia_csrf_token', {
      httpOnly: false,
      secure: options.secure,
      sameSite: options.sameSite,
      path: '/api',
    });
  }

  // 🔓 PUBLIC - Connexion
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000, blockDuration: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() payload: LoginDto, @Res({ passthrough: true }) response: Response) {
    const user = await this.authService.validateUser(
      payload.identifier,
      payload.password,
    );

    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const session = await this.authService.login({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      primaryRole: user.primaryRole || 'PATIENT',
      status: user.status,
    });
    this.setSessionCookies(response, session);
    return { user: session.user };
  }

  // 🔓 PUBLIC - Renouvellement du token
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000, blockDuration: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() payload: RefreshTokenDto = {},
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // A cookie-only refresh request legitimately has an empty body. Never
    // dereference it: a missing/expired token must be returned as 401 by the
    // service, not as an unhandled 500 error.
    const refreshToken = this.readCookie(request, 'aulia_refresh_token') || payload?.refreshToken;
    const session = await this.authService.refreshAccessToken(refreshToken);
    this.setSessionCookies(response, session);
    return { ok: true };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: any, @Res({ passthrough: true }) response: Response) {
    await this.authService.logoutCurrentSession(user?.userId, user?.sessionId);
    this.clearSessionCookies(response);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: any, @Res({ passthrough: true }) response: Response) {
    await this.authService.logoutAllSessions(user?.userId);
    this.clearSessionCookies(response);
  }

  /** Restores a missing non-secret double-submit value without weakening CSRF. */
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Get('csrf')
  csrf(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    this.setCsrfCookie(response);
  }

  /** A CSRF cookie is not proof of authentication: it is also issued before a
   * public login. This minimal endpoint lets the SPA decide whether restoring
   * a cookie session is useful without provoking a visible 401 on /auth/me. */
  @Public()
  @Get('session-hint')
  sessionHint(@Req() request: Request) {
    return {
      hasSession: Boolean(
        this.readCookie(request, 'aulia_access_token') || this.readCookie(request, 'aulia_refresh_token'),
      ),
    };
  }

  /** Clears only browser cookies after an already-invalid session. It is still
   * covered by the global double-submit CSRF middleware when cookies exist. */
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('clear-expired-session')
  clearExpiredSession(@Res({ passthrough: true }) response: Response) {
    this.clearSessionCookies(response);
  }

  // 🔒 PROTÉGÉ - Récupérer le profil actuel (user complet)
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Get('me')
  async me(@CurrentUser() user: any): Promise<CurrentUserResponseDto> {
    const fullUser = await this.authService.getUserById(user.userId);
    return fullUser as CurrentUserResponseDto;
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Get('security-status')
  securityStatus(@CurrentUser() user: any) {
    return this.authService.getSecurityStatus(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('lock-session')
  async lockSession(@CurrentUser() user: any) {
    await this.authService.lockCurrentSession(user.userId, user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Patch('profile')
  async updateProfile(@CurrentUser() user: any, @Body() payload: UpdateUserDto): Promise<CurrentUserResponseDto> {
    return this.authService.updateProfile(user.userId, payload) as Promise<CurrentUserResponseDto>;
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000, blockDuration: 15 * 60_000 } })
  @Post('change-pin')
  async changePin(@CurrentUser() user: any, @Body() body: ChangePinDto) {
    return this.authService.changePin(user.userId, body.currentPin, body.nextPin);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000, blockDuration: 15 * 60_000 } })
  @Post('verify-pin')
  async verifyPin(@CurrentUser() user: any, @Body() body: VerifyPinDto) {
    return this.authService.verifyPin(user.userId, body.pin, user.sessionId);
  }
}
