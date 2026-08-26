import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
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
    this.accessTokenSecret = configService.getOrThrow<string>('JWT_SECRET');
    this.refreshTokenSecret = configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTokenExpires = configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    this.refreshTokenExpires = configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
  }

  async validateUser(identifier: string, password: string) {
    const normalized = identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalized }, { username: normalized }],
        deletedAt: null,
        status: 'ACTIVE',
      },
    });

    if (!user) {
      await this.prisma.loginAttempt.create({ data: { username: normalized, result: 'FAILURE' } });
      return null;
    }
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      await this.prisma.loginAttempt.create({ data: { userId: user.id, username: normalized, result: 'FAILURE' } });
      return null;
    }

    await this.prisma.loginAttempt.create({ data: { userId: user.id, username: normalized, result: 'SUCCESS' } });

    return user;
  }

  private signAccessToken(user: { id: string; email: string; username: string; primaryRole: string | null }, sessionId: string) {
    const payload: any = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.primaryRole,
      sid: sessionId,
    };
    return this.jwtService.sign(payload as any, {
      secret: this.accessTokenSecret,
      expiresIn: this.accessTokenExpires,
    } as any);
  }

  private signRefreshToken(user: { id: string; email: string; username: string; primaryRole: string | null }, sessionId: string) {
    const payload: any = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.primaryRole,
      type: 'refresh',
      sid: sessionId,
    };
    return this.jwtService.sign(payload as any, {
      secret: this.refreshTokenSecret,
      expiresIn: this.refreshTokenExpires,
    } as any);
  }

  async login(user: { id: string; email: string; username: string; displayName: string; primaryRole: string | null; status?: string }) {
    const sessionId = randomUUID();
    const accessToken = this.signAccessToken(user, sessionId);
    const refreshToken = this.signRefreshToken(user, sessionId);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } }),
      this.prisma.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          // The raw token is never persisted.  A hash is sufficient for an
          // auditable session trail and future selective revocation.
          tokenHash: await bcrypt.hash(refreshToken, 10),
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);
    await this.audit(user.id, 'AUTH_SESSION', sessionId, { event: 'LOGIN' });

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

  async logoutCurrentSession(userId?: string, sessionId?: string) {
    if (!userId || !sessionId) return;
    const revoked = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'USER_LOGOUT', lastSeenAt: new Date() },
    });
    if (revoked.count) await this.audit(userId, 'AUTH_SESSION', sessionId, { event: 'LOGOUT' });
  }

  async logoutAllSessions(userId?: string) {
    if (!userId) return;
    const revoked = await this.prisma.session.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'USER_LOGOUT_ALL', lastSeenAt: new Date() },
    });
    if (revoked.count) await this.audit(userId, 'AUTH_SESSION', userId, { event: 'LOGOUT_ALL', sessionCount: revoked.count });
  }

  async changePin(userId: string, currentPin: string, nextPin: string) {
    if (!/^\d{4,6}$/.test(nextPin)) {
      throw new BadRequestException('Le nouveau code PIN doit contenir entre 4 et 6 chiffres.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, pinHash: true, pinLockedUntil: true } });
    if (!user) throw new UnauthorizedException('Authentification requise.');
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      throw new UnauthorizedException('Le code PIN est temporairement verrouillé. Réessayez dans quelques minutes.');
    }
    // Until a PIN has been created, confirmation uses the existing account
    // password. Afterwards only the PIN may authorize a PIN replacement.
    const currentHash = user.pinHash || user.passwordHash;
    if (!(await bcrypt.compare(currentPin, currentHash))) {
      await this.recordPinFailure(userId);
      throw new UnauthorizedException('Le mot de passe initial ou le code PIN actuel est incorrect.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pinHash: await bcrypt.hash(nextPin, 12),
        pinUpdatedAt: new Date(),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    });
    await this.audit(userId, 'AUTH_PIN', userId, { event: 'PIN_CHANGED' });
    return { ok: true };
  }

  async verifyPin(userId: string, pin: string, sessionId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { pinHash: true, pinLockedUntil: true } });
    if (!user?.pinHash) throw new UnauthorizedException('Configurez d’abord votre code PIN dans Sécurité personnelle.');
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      throw new UnauthorizedException('Le code PIN est temporairement verrouillé. Réessayez dans quelques minutes.');
    }
    if (!(await bcrypt.compare(pin, user.pinHash))) {
      await this.recordPinFailure(userId);
      throw new UnauthorizedException('Code PIN incorrect.');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { pinFailedAttempts: 0, pinLockedUntil: null } }),
      ...(sessionId ? [this.prisma.session.updateMany({
        where: { id: sessionId, userId, status: 'ACTIVE' },
        data: { pinLockedAt: null, pinVerifiedAt: new Date(), lastSeenAt: new Date() },
      })] : []),
    ]);
    await this.audit(userId, 'AUTH_PIN', sessionId || userId, { event: 'PIN_VERIFIED' });
    return { ok: true };
  }

  async lockCurrentSession(userId: string, sessionId?: string) {
    if (!sessionId) throw new UnauthorizedException('Session manquante.');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { pinHash: true } });
    if (!user?.pinHash) return { locked: false, hasPin: false };
    const locked = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, status: 'ACTIVE' },
      data: { pinLockedAt: new Date() },
    });
    if (!locked.count) throw new UnauthorizedException('Session expirée ou révoquée.');
    await this.audit(userId, 'AUTH_SESSION', sessionId, { event: 'SESSION_PIN_LOCKED' });
    return { locked: true, hasPin: true };
  }

  private async recordPinFailure(userId: string) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { pinFailedAttempts: { increment: 1 } }, select: { pinFailedAttempts: true } });
    await this.audit(userId, 'AUTH_PIN', userId, { event: 'PIN_FAILED', attempts: user.pinFailedAttempts });
    if (user.pinFailedAttempts >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      // Keep the count for post-incident review. It is reset only after a
      // successful PIN verification, never when the lock is applied.
      await this.prisma.user.update({ where: { id: userId }, data: { pinLockedUntil: lockedUntil } });
      await this.audit(userId, 'AUTH_PIN', userId, { event: 'PIN_LOCKED', reason: 'FAILED_ATTEMPTS', attempts: user.pinFailedAttempts, lockedUntil: lockedUntil.toISOString() });
    }
  }

  private async audit(actorId: string, entity: string, entityId: string, after: Record<string, unknown>) {
    await this.prisma.auditTrail.create({ data: { actorId, entity, entityId, action: 'UPDATE', after: after as Prisma.InputJsonValue } });
  }

  async refreshAccessToken(token?: string) {
    try {
      if (!token) {
        throw new UnauthorizedException('Refresh token missing');
      }
      const payload = this.jwtService.verify(token, {
        secret: this.refreshTokenSecret,
      });

      // Vérifier que c'est bien un refresh token
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const sessionId = typeof payload.sid === 'string' ? payload.sid : null;
      if (!sessionId) throw new UnauthorizedException('Session refresh invalide');
      const session = await this.prisma.session.findFirst({
        where: { id: sessionId, userId: payload.sub, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      });
      if (!session) {
        throw new UnauthorizedException('Session refresh révoquée ou expirée');
      }
      const currentTokenMatches = await bcrypt.compare(token, session.tokenHash);
      if (!currentTokenMatches) {
        const consumedTokens = await this.prisma.sessionRefreshTokenHistory.findMany({
          where: { sessionId },
          select: { tokenHash: true },
          orderBy: { consumedAt: 'desc' },
          take: 50,
        });
        const replayed = (await Promise.all(consumedTokens.map((entry) => bcrypt.compare(token, entry.tokenHash)))).some(Boolean);
        if (replayed) {
          await this.prisma.session.update({
            where: { id: sessionId },
            data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'REFRESH_TOKEN_REUSE' },
          });
          await this.audit(payload.sub, 'AUTH_SESSION', sessionId, { event: 'REFRESH_REUSE_DETECTED' });
        }
        throw new UnauthorizedException('Session refresh révoquée ou expirée');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.deletedAt || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Compte inactif ou suspendu');
      }

      const accessToken = this.signAccessToken(user, sessionId);
      const refreshToken = this.signRefreshToken(user, sessionId);
      await this.prisma.$transaction([
        this.prisma.sessionRefreshTokenHistory.create({ data: { sessionId, tokenHash: session.tokenHash } }),
        this.prisma.session.update({ where: { id: sessionId }, data: { tokenHash: await bcrypt.hash(refreshToken, 10), lastSeenAt: new Date() } }),
      ]);
      return { accessToken, refreshToken };
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

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /** Exposes no secret: the client only needs to know whether a PIN challenge
   * is applicable for an already authenticated session. */
  async getSecurityStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pinHash: true, pinLockedUntil: true },
    });
    if (!user) throw new UnauthorizedException('Session utilisateur introuvable.');
    return {
      hasPin: Boolean(user.pinHash),
      pinLockedUntil: user.pinLockedUntil?.toISOString() ?? null,
    };
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
