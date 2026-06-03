import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  UseGuards,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import { CurrentUserResponseDto } from './dto/current-user-response.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 🔓 PUBLIC - Connexion
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() payload: LoginDto) {
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

    return this.authService.login({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      primaryRole: user.primaryRole || 'PATIENT',
    });
  }

  // 🔓 PUBLIC - Renouvellement du token
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() payload: RefreshTokenDto) {
    return this.authService.refreshAccessToken(payload.refreshToken);
  }

  // 🔒 PROTÉGÉ - Récupérer le profil actuel (user complet)
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Get('me')
  async me(@CurrentUser() user: any): Promise<CurrentUserResponseDto> {
    const fullUser = await this.authService.getUserById(user.userId);
    return fullUser as CurrentUserResponseDto;
  }
}