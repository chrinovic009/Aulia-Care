import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { isOperationalRole } from '../core/tenant-roles';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService, private readonly prisma: PrismaService) {
    super({
      passReqToCallback: true,
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

  async validate(request: any, payload: any) {
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
        roles: { where: { active: true, role: { deletedAt: null } }, select: { role: { select: { slug: true } } } },
        mustChangePassword: true,
        clinicId: true,
        clinic: { select: { status: true, deletedAt: true } },
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
    if (isOperationalRole(user.primaryRole) && !user.clinicId) {
      // Fail closed. An old account is repaired by the explicit tenant tool;
      // it must never receive an unscoped clinical or financial session.
      throw new UnauthorizedException('Compte institutionnel non rattaché à un établissement. Contactez le Super Admin.');
    }
    if (isOperationalRole(user.primaryRole) && (!user.clinic || user.clinic.deletedAt || user.clinic.status !== 'ACTIVE')) {
      throw new UnauthorizedException('Cet établissement est désactivé. Contactez la plateforme Aulia Care : contact@aulia-care.com');
    }

    // Access tokens are bound to a persisted session. This makes a targeted
    // logout effective immediately instead of waiting for token expiration.
    if (typeof payload.sid !== 'string') {
      throw new UnauthorizedException('Session manquante');
    }
    const session = await this.prisma.session.findFirst({
      where: { id: payload.sid, userId: user.id, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      select: { id: true, pinLockedAt: true },
    });
    if (!session) throw new UnauthorizedException('Session expirée ou révoquée');
    const path = String(request?.path || request?.originalUrl || '');
    const pinGatePath = ['/api/auth/security-status', '/api/auth/lock-session', '/api/auth/verify-pin', '/api/auth/logout', '/api/auth/logout-all'];
    if (session.pinLockedAt && !pinGatePath.some((allowed) => path.startsWith(allowed))) {
      throw new UnauthorizedException('Session verrouillée : saisissez votre code PIN pour continuer.');
    }
    // An account opened or reset by an administrator only reaches the
    // password-change screen until its holder has chosen their own password.
    const passwordGatePath = ['/api/auth/me', '/api/auth/change-password', '/api/auth/security-status', '/api/auth/logout', '/api/auth/logout-all'];
    if (user.mustChangePassword && !passwordGatePath.some((allowed) => path.startsWith(allowed))) {
      throw new ForbiddenException({ statusCode: 403, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Vous devez changer votre mot de passe avant de continuer.' });
    }

    return {
      userId: user.id,
      sessionId: session.id,
      email: payload.email,
      username: payload.username,
      role: user.primaryRole,
      roles: user.roles.map(item => item.role.slug),
      clinicId: user.clinicId,
      serviceResponsabilites: user.serviceResponsabilites,
      // CORRIGÉ : Utilisation du bon nom de propriété sans "as any"
      departmentResponsibilities: user.departmentResponsibilities,
    };
  }
}
