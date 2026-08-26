import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => String(request?.headers?.cookie || '')
          .split(';')
          .map((value) => value.trim())
          .find((value) => value.startsWith('aulia_access_token='))
          ?.slice('aulia_access_token='.length) || null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // Rejeter les refresh tokens dans le JWT strategy
    if (payload.type === 'refresh') {
      throw new Error('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        status: true,
        deletedAt: true,
        primaryRole: true,
        serviceResponsabilites: {
          where: { actif: true },
          include: { service: true },
        },
        // CORRIGÉ : departmentResponsibilities ("ties" au lieu de "tes")
        departmentResponsibilities: {
          where: { actif: true },
          include: { department: true },
        },
      },
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Compte inactif ou suspendu');
    }

    // Access tokens are bound to a persisted session. This makes a targeted
    // logout effective immediately instead of waiting for token expiration.
    if (typeof payload.sid !== 'string') {
      throw new UnauthorizedException('Session manquante');
    }
    const session = await this.prisma.session.findFirst({
      where: { id: payload.sid, userId: user.id, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (!session) throw new UnauthorizedException('Session expirée ou révoquée');

    return {
      userId: user.id,
      sessionId: session.id,
      email: payload.email,
      username: payload.username,
      role: user.primaryRole,
      serviceResponsabilites: user.serviceResponsabilites,
      // CORRIGÉ : Utilisation du bon nom de propriété sans "as any"
      departmentResponsibilities: user.departmentResponsibilities,
    };
  }
}
