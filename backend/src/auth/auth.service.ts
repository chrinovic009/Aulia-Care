import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpires: string;
  private readonly refreshTokenExpires: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.accessTokenSecret = configService.get<string>('JWT_SECRET', 'change_me_access');
    this.refreshTokenSecret = configService.get<string>('JWT_REFRESH_SECRET', 'change_me_refresh');
    this.accessTokenExpires = configService.get<string>('JWT_EXPIRES_IN', '365d');
    this.refreshTokenExpires = configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
  }

  async validateUser(identifier: string, password: string) {
    const normalized = identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalized }, { username: normalized }],
      },
    });

    if (!user) return null;
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) return null;

    return user;
  }

  private signAccessToken(user: { id: string; email: string; username: string; primaryRole: string | null }) {
    const payload: any = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.primaryRole,
    };
    return this.jwtService.sign(payload as any, {
      secret: this.accessTokenSecret,
      expiresIn: this.accessTokenExpires,
    } as any);
  }

  private signRefreshToken(user: { id: string; email: string; username: string; primaryRole: string | null }) {
    const payload: any = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.primaryRole,
      type: 'refresh',
    };
    return this.jwtService.sign(payload as any, {
      secret: this.refreshTokenSecret,
      expiresIn: this.refreshTokenExpires,
    } as any);
  }

  async login(user: { id: string; email: string; username: string; displayName: string; primaryRole: string | null; status?: string }) {
    const accessToken = this.signAccessToken(user);
    const refreshToken = this.signRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        primaryRole: user.primaryRole,
        status: user.status,
      },
    };
  }

  async refreshAccessToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.refreshTokenSecret,
      });

      // Vérifier que c'est bien un refresh token
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const accessToken = this.signAccessToken(user);
      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        firstName: true,
        lastName: true,
        primaryRole: true,
        phone: true,
        specialty: true,
        nationality: true,
        addressCountry: true,
        addressProvince: true,
        addressCity: true,
        addressNeighborhood: true,
        addressStreet: true,
        whatsappUrl: true,
        facebookUrl: true,
        instagramUrl: true,
        linkedinUrl: true,
        bio: true,
        profilePhotoUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        Employee: {
          include: {
            shifts: {
              orderBy: { startAt: 'desc' },
              take: 5,
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async updateProfile(id: string, dto: UpdateUserDto) {
    const allowed: any = {};
    for (const key of [
      'displayName',
      'firstName',
      'lastName',
      'email',
      'username',
      'phone',
      'specialty',
      'nationality',
      'addressCountry',
      'addressProvince',
      'addressCity',
      'addressNeighborhood',
      'addressStreet',
      'bio',
    ]) {
      if ((dto as any)[key] !== undefined) allowed[key] = (dto as any)[key];
    }

    if (dto.password) {
      allowed.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (allowed.email) allowed.email = String(allowed.email).toLowerCase();
    if (allowed.username) allowed.username = String(allowed.username).toLowerCase();

    await this.prisma.user.update({ where: { id }, data: allowed });
    return this.getUserById(id);
  }
}
