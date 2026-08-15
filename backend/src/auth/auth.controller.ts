import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
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
    response.cookie('aulia_csrf_token', randomBytes(32).toString('hex'), {
      httpOnly: false,
      secure: options.secure,
      sameSite: options.sameSite,
      path: '/api',
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
      return {
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Identifiants invalides',
      };
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
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() payload: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.readCookie(request, 'aulia_refresh_token') || payload.refreshToken;
    const session = await this.authService.refreshAccessToken(refreshToken);
    this.setSessionCookies(response, session);
    return { ok: true };
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
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
  @Patch('profile')
  async updateProfile(@CurrentUser() user: any, @Body() payload: UpdateUserDto): Promise<CurrentUserResponseDto> {
    return this.authService.updateProfile(user.userId, payload) as Promise<CurrentUserResponseDto>;
  }
}
