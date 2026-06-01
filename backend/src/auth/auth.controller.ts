import { Body, Controller, HttpCode, HttpStatus, Post, Get, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() payload: LoginDto) {
    const user = await this.authService.validateUser(payload.identifier, payload.password);
    if (!user) {
      return { statusCode: HttpStatus.UNAUTHORIZED, message: 'Identifiants invalides' };
    }
    return this.authService.login(user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() payload: RefreshTokenDto) {
    return this.authService.refreshToken(payload.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: Request) {
    // Passport sets req.user from JWT payload; return minimal safe profile
    // If the JWT payload only contains user id, backend strategy populates `user` with DB user
    // Here we return req.user as-is; controllers/services can be enhanced to fetch full profile if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyReq = req as any;
    return anyReq.user || null;
  }
}
