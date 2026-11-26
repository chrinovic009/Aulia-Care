import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { TEMPORARY_CODE_MAX_ATTEMPTS, passwordPolicyError } from './password-policy';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runWithRequestContext } from '../core/request-context';
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
    const rawIdentifier = identifier.trim();
    const normalized = rawIdentifier.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        // The sign-in screen explicitly accepts an employee matricule. It must
        // therefore be resolved server-side, never merely labelled that way.
        OR: [
          { email: normalized },
          { username: normalized },
          { Employee: { some: { employeeNumber: rawIdentifier } } },
          { Employee: { some: { employeeNumber: rawIdentifier.toUpperCase() } } },
        ],
        deletedAt: null,
        status: 'ACTIVE',
      },
    });

    if (!user) {
      await this.prisma.loginAttempt.create({ data: { username: normalized, result: 'FAILURE' } });
      return null;
    }
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    // A 6-digit code is pending: valid until used, revoked after a few wrong attempts.
    const hasTemporaryCode = user.mustChangePassword && (Boolean(user.temporaryCodeCipher) || Boolean(user.temporaryPasswordExpiresAt));
    if (!passwordMatches) {
      await this.prisma.loginAttempt.create({ data: { userId: user.id, username: normalized, result: 'FAILURE' } });
      if (hasTemporaryCode) {
        // A 6-digit code is short: after a few wrong attempts it is revoked and
        // the holder must ask for a new one.
        const attempts = user.temporaryPasswordAttempts + 1;
        await this.prisma.user.update({
          where: { id: user.id },
          data: attempts >= TEMPORARY_CODE_MAX_ATTEMPTS
            ? { temporaryPasswordAttempts: attempts, temporaryPasswordExpiresAt: new Date(0), temporaryCodeCipher: null, passwordHash: await bcrypt.hash(randomUUID(), 10) }
            : { temporaryPasswordAttempts: attempts },
        });
      }
      return null;
    }
    if (hasTemporaryCode && user.temporaryPasswordExpiresAt && user.temporaryPasswordExpiresAt <= new Date()) {
      await this.prisma.loginAttempt.create({ data: { userId: user.id, username: normalized, result: 'FAILURE' } });
      throw new UnauthorizedException('Ce code a expiré. Faites une demande « Mot de passe oublié » : l’administrateur vous remettra un nouveau code.');
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
      jti: randomUUID(),
    };
    return this.jwtService.sign(payload as any, {
      secret: this.refreshTokenSecret,
      expiresIn: this.refreshTokenExpires,
    } as any);
  }

  private refreshFingerprint(token: string) {
    return `sha256:${createHash('sha256').update(token, 'utf8').digest('hex')}`;
  }

  private fingerprintMatches(left: string, right: string) {
    if (!/^sha256:[a-f0-9]{64}$/.test(right)) return false;
    return timingSafeEqual(Buffer.from(left), Buffer.from(right));
  }

  async login(user: { id: string; email: string; username: string; displayName: string; primaryRole: string | null; status?: string; mustChangePassword?: boolean }) {
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
          tokenHash: this.refreshFingerprint(refreshToken),
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
        mustChangePassword: Boolean(user.mustChangePassword),
      },
    };
  }

  /**
   * The account holder replaces their password. Required after an account was
   * opened or reset by an administrator: until then every other API call is
   * refused (see JwtStrategy). Other sessions are revoked.
   */
  async changePassword(userId: string, sessionId: string | undefined, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, username: true, firstName: true, lastName: true, mustChangePassword: true, PasswordHistory: { orderBy: { changedAt: 'desc' }, take: 5, select: { passwordHash: true } } },
    });
    if (!user) throw new UnauthorizedException('Session utilisateur introuvable.');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      await this.prisma.loginAttempt.create({ data: { userId, username: user.username, result: 'FAILURE' } });
      throw new BadRequestException('Le mot de passe actuel est incorrect.');
    }
    const refused = passwordPolicyError(newPassword);
    if (refused) throw new BadRequestException(refused);
    if (newPassword === currentPassword) throw new BadRequestException('Choisissez un mot de passe différent du mot de passe actuel.');
    for (const previous of user.PasswordHistory) {
      if (await bcrypt.compare(newPassword, previous.passwordHash)) throw new BadRequestException('Ce mot de passe a déjà été utilisé récemment. Choisissez-en un autre.');
    }
    const now = new Date();
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.passwordHistory.create({ data: { userId, passwordHash: user.passwordHash } }),
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false, passwordChangedAt: now, temporaryPasswordExpiresAt: null, temporaryPasswordAttempts: 0, temporaryCodeCipher: null, temporaryCodeReason: null } }),
      this.prisma.session.updateMany({
        where: { userId, status: 'ACTIVE', ...(sessionId ? { id: { not: sessionId } } : {}) },
        data: { status: 'REVOKED', revokedAt: now, revocationReason: 'PASSWORD_CHANGED', lastSeenAt: now },
      }),
    ]);
    await this.audit(userId, 'USER', userId, { event: 'PASSWORD_CHANGED', required: user.mustChangePassword });
    return { ok: true, mustChangePassword: false };
  }

  /**
   * Forgotten password. The holder only asks: an administrator of the
   * establishment approves and hands over a new 6-digit code. The answer is
   * the same whether or not the account exists.
   */
  async requestPasswordReset(identifier: string) {
    const raw = identifier.trim();
    const answer = { ok: true, message: 'Si ce compte existe, votre demande a été transmise à l’administrateur de votre établissement. Il vous remettra un nouveau code.' };
    if (!raw) return answer;
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null, status: 'ACTIVE', primaryRole: { notIn: ['PATIENT', 'DEV'] },
        OR: [{ email: raw.toLowerCase() }, { username: raw.toLowerCase() }, { Employee: { some: { employeeNumber: raw } } }, { Employee: { some: { employeeNumber: raw.toUpperCase() } } }],
      },
      select: { id: true, clinicId: true },
    });
    if (!user) return answer;
    const pending = await this.prisma.passwordResetRequest.findFirst({ where: { userId: user.id, status: 'PENDING' }, select: { id: true } });
    if (!pending) {
      await this.prisma.passwordResetRequest.create({ data: { userId: user.id, clinicId: user.clinicId } }).catch(() => undefined);
    }
    return answer;
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
      if (!token) throw new UnauthorizedException('Refresh token missing');
      const payload = this.jwtService.verify(token, { secret: this.refreshTokenSecret });
      if (payload.type !== 'refresh' || typeof payload.sub !== 'string') throw new UnauthorizedException('Invalid token type');
      // The refresh endpoint is public, but its verified JWT subject provides
      // a narrow owner context for the persisted session and token history.
      return await runWithRequestContext(
        { userId: payload.sub, role: 'AUTH_REFRESH', route: 'POST /auth/refresh' },
        () => this.refreshAccessTokenScoped(token),
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async refreshAccessTokenScoped(token?: string) {
    try {
      if (!token) {
        throw new UnauthorizedException('Refresh token missing');
      }
      const payload = this.jwtService.verify(token, {
        secret: this.refreshTokenSecret,
      });

      // Vérifier que c'est bien un refresh token
      if (payload.type !== 'refresh' || typeof payload.sub !== 'string') {
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
      // Legacy bcrypt hashes cannot safely identify the entire JWT. Require a
      // fresh login rather than interpreting them as full-token fingerprints.
      if (!/^sha256:[a-f0-9]{64}$/.test(session.tokenHash)) {
        await this.prisma.session.updateMany({
          where: { id: sessionId, userId: payload.sub, status: 'ACTIVE', tokenHash: session.tokenHash },
          data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'LEGACY_REFRESH_HASH' },
        });
        throw new UnauthorizedException('Reconnexion requise');
      }

      const fingerprint = this.refreshFingerprint(token);
      const currentTokenMatches = this.fingerprintMatches(fingerprint, session.tokenHash);
      if (!currentTokenMatches) {
        const replayed = await this.prisma.sessionRefreshTokenHistory.findFirst({
          where: { sessionId, tokenHash: fingerprint }, select: { id: true },
        });
        if (replayed) {
          await this.prisma.session.updateMany({
            where: { id: sessionId, userId: payload.sub, status: 'ACTIVE' },
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
      const rotated = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.session.updateMany({
          where: { id: sessionId, userId: user.id, status: 'ACTIVE', tokenHash: fingerprint, expiresAt: { gt: new Date() } },
          data: { tokenHash: this.refreshFingerprint(refreshToken), lastSeenAt: new Date() },
        });
        if (updated.count !== 1) return false;
        await tx.sessionRefreshTokenHistory.create({ data: { sessionId, tokenHash: fingerprint } });
        return true;
      });
      if (!rotated) {
        // Another request consumed this token first. Confirm that history was
        // committed before treating it as reuse and revoking the session.
        const consumed = await this.prisma.sessionRefreshTokenHistory.findFirst({
          where: { sessionId, tokenHash: fingerprint }, select: { id: true },
        });
        if (consumed) {
          await this.prisma.session.updateMany({
            where: { id: sessionId, userId: user.id, status: 'ACTIVE' },
            data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'REFRESH_TOKEN_REUSE' },
          });
          await this.audit(user.id, 'AUTH_SESSION', sessionId, { event: 'REFRESH_REUSE_DETECTED' });
        }
        throw new UnauthorizedException('Session refresh révoquée ou expirée');
      }
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
        roles: {where:{active:true,role:{deletedAt:null}},select:{role:{select:{slug:true}}}},
        clinicId: true,
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
        mustChangePassword: true,
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

    // A person signing in with a 6-digit code learns who read that code.
    const accessCodeReveals = user.mustChangePassword ? await this.accessCodeReveals(id) : [];
    return {...user, roles:user.roles.map(item=>item.role.slug), accessCodeReveals};
  }

  private async accessCodeReveals(userId: string) {
    const holder = await this.prisma.user.findUnique({ where: { id: userId }, select: { temporaryCodeIssuedAt: true } });
    const rows = await this.prisma.auditTrail.findMany({
      where: { entity: 'USER', entityId: userId, after: { path: ['event'], equals: 'ACCESS_CODE_REVEALED' }, ...(holder?.temporaryCodeIssuedAt ? { changedAt: { gte: holder.temporaryCodeIssuedAt } } : {}) },
      select: { changedAt: true, actor: { select: { firstName: true, lastName: true, primaryRole: true } } },
      orderBy: { changedAt: 'asc' },
      take: 20,
    });
    return rows.map((row) => ({ at: row.changedAt.toISOString(), by: row.actor ? `${row.actor.firstName} ${row.actor.lastName}`.trim() : 'Administrateur', role: row.actor?.primaryRole ?? null }));
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
      'nationality',
      'addressCountry',
      'addressProvince',
      'addressCity',
      'addressNeighborhood',
      'addressStreet',
      'bio',
      'whatsappUrl',
      'facebookUrl',
      'instagramUrl',
      'linkedinUrl',
    ]) {
      const value = dto[key as keyof UpdateUserDto];
      if (value !== undefined) {
        const normalized = typeof value === 'string' ? value.trim() : value;
        (allowed as Record<string, unknown>)[key] = normalized === '' ? null : normalized;
      }
    }

    // The password goes through POST /auth/change-password (current password,
    // policy, history). The specialty is set by the administrator only and is
    // therefore not in the self-service list above.
    if (dto.password) {
      throw new BadRequestException('Utilisez « Changer mon mot de passe » : le mot de passe actuel est demandé.');
    }

    if (allowed.email) allowed.email = String(allowed.email).toLowerCase();
    if (allowed.username) allowed.username = String(allowed.username).toLowerCase();

    await this.prisma.user.update({ where: { id }, data: allowed });
    return this.getUserById(id);
  }
}
