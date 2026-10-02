import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

const configuration = {
  getOrThrow: () => 'test-secret',
  get: <T>(_key: string, fallback: T) => fallback,
} as unknown as ConfigService;

function makeService(prisma: Record<string, unknown>, jwt: Record<string, unknown> = {}) {
  const jwtService = {
    sign: () => 'new-token',
    verify: () => ({ sub: 'user-1', sid: 'session-1', type: 'refresh' }),
    ...jwt,
  } as unknown as JwtService;
  return new AuthService(prisma as unknown as PrismaService, jwtService, configuration);
}

test('first PIN configuration verifies the account password without changing passwordHash', async () => {
  const accountPasswordHash = await bcrypt.hash('AUP-NM22026', 10);
  let updateData: Record<string, unknown> | undefined;
  const prisma = {
    user: {
      findUnique: async () => ({ passwordHash: accountPasswordHash, pinHash: null, pinLockedUntil: null }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateData = data;
        return {};
      },
    },
    auditTrail: { create: async () => ({}) },
  };

  await makeService(prisma).changePin('user-1', 'AUP-NM22026', '1234');

  assert.ok(updateData);
  assert.equal('passwordHash' in updateData, false);
  assert.equal(await bcrypt.compare('1234', String(updateData.pinHash)), true);
  assert.equal(updateData.pinFailedAttempts, 0);
});

test('valid PIN unlocks only the current persistent session and resets failed attempts', async () => {
  const pinHash = await bcrypt.hash('1234', 10);
  const sessionUpdates: Array<Record<string, unknown>> = [];
  const prisma = {
    user: {
      findUnique: async () => ({ pinHash, pinLockedUntil: null }),
      update: async () => ({}),
    },
    session: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        sessionUpdates.push(data);
        return { count: 1 };
      },
    },
    auditTrail: { create: async () => ({}) },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };

  const result = await makeService(prisma).verifyPin('user-1', '1234', 'session-1');

  assert.deepEqual(result, { ok: true });
  assert.equal(sessionUpdates.length, 1);
  assert.equal(sessionUpdates[0].pinLockedAt, null);
  assert.ok(sessionUpdates[0].pinVerifiedAt instanceof Date);
});

test('five failed PIN attempts preserve the evidence and lock the account for fifteen minutes', async () => {
  const pinHash = await bcrypt.hash('1234', 10);
  const userUpdates: Array<Record<string, unknown>> = [];
  const prisma = {
    user: {
      findUnique: async () => ({ pinHash, pinLockedUntil: null }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        userUpdates.push(data);
        return typeof data.pinFailedAttempts === 'object' ? { pinFailedAttempts: 5 } : {};
      },
    },
    auditTrail: { create: async () => ({}) },
  };

  await assert.rejects(() => makeService(prisma).verifyPin('user-1', '0000'), UnauthorizedException);

  assert.deepEqual(userUpdates[0], { pinFailedAttempts: { increment: 1 } });
  assert.ok(userUpdates[1]?.pinLockedUntil instanceof Date);
});

const fingerprint = (token: string) => `sha256:${createHash('sha256').update(token).digest('hex')}`;

function refreshFixture(initialToken: string, initialHash = fingerprint(initialToken)) {
  const jwt = new JwtService();
  const history: string[] = [];
  const session = {
    id: 'session-1', userId: 'user-1', tokenHash: initialHash,
    status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000),
    revocationReason: null as string | null,
  };
  const user = {
    id: 'user-1', email: 'user@example.test', username: 'user-1',
    primaryRole: 'NURSE', status: 'ACTIVE', deletedAt: null,
  };
  const database = {
    session: {
      findFirst: async () => session.status === 'ACTIVE' && session.expiresAt > new Date() ? { ...session } : null,
      updateMany: async ({ where, data }: {
        where: { tokenHash?: string; status?: string };
        data: { tokenHash?: string; status?: string; revocationReason?: string };
      }) => {
        if (where.status && where.status !== session.status) return { count: 0 };
        if (where.tokenHash && where.tokenHash !== session.tokenHash) return { count: 0 };
        if (data.tokenHash) session.tokenHash = data.tokenHash;
        if (data.status) session.status = data.status;
        if (data.revocationReason) session.revocationReason = data.revocationReason;
        return { count: 1 };
      },
    },
    sessionRefreshTokenHistory: {
      findFirst: async ({ where }: { where: { tokenHash: string } }) =>
        history.includes(where.tokenHash) ? { id: 'consumed' } : null,
      create: async ({ data }: { data: { tokenHash: string } }) => {
        history.push(data.tokenHash);
        return { id: 'consumed' };
      },
    },
    user: { findUnique: async () => user },
    auditTrail: { create: async () => ({}) },
    $transaction: async (callback: (tx: typeof database) => Promise<unknown>) => callback(database),
  };
  const service = new AuthService(database as unknown as PrismaService, jwt, configuration);
  return { jwt, service, session, user, history };
}

function signedRefresh(jwt: JwtService, jti: string) {
  return jwt.sign(
    { sub: 'user-1', email: 'user@example.test', username: 'user-1', role: 'NURSE', type: 'refresh', sid: 'session-1', jti },
    { secret: 'test-secret', expiresIn: '7d' },
  );
}

test('rotates a signed refresh token and records its full-token fingerprint', async () => {
  const jwt = new JwtService();
  const token = signedRefresh(jwt, 'first');
  const fixture = refreshFixture(token);
  const rotated = await fixture.service.refreshAccessToken(token);
  assert.ok(rotated.accessToken);
  assert.notEqual(rotated.refreshToken, token);
  assert.equal(fixture.history[0], fingerprint(token));
  assert.equal(fixture.session.tokenHash, fingerprint(rotated.refreshToken));
});

test('reusing a signed consumed refresh token revokes the session', async () => {
  const jwt = new JwtService();
  const token = signedRefresh(jwt, 'first');
  const fixture = refreshFixture(token);
  await fixture.service.refreshAccessToken(token);
  await assert.rejects(() => fixture.service.refreshAccessToken(token), UnauthorizedException);
  assert.equal(fixture.session.status, 'REVOKED');
  assert.equal(fixture.session.revocationReason, 'REFRESH_TOKEN_REUSE');
});

test('different signed JWTs with the same first 72 bytes cannot share a session', async () => {
  const jwt = new JwtService();
  const first = signedRefresh(jwt, 'aaaaaaaa-aaaaaaaa');
  const second = signedRefresh(jwt, 'bbbbbbbb-bbbbbbbb');
  assert.equal(first.slice(0, 72), second.slice(0, 72));
  const fixture = refreshFixture(first);
  await assert.rejects(() => fixture.service.refreshAccessToken(second), UnauthorizedException);
  assert.equal(fixture.session.status, 'ACTIVE');
});

test('simultaneous signed refresh attempts cannot both rotate one token', async () => {
  const jwt = new JwtService();
  const token = signedRefresh(jwt, 'concurrent');
  const fixture = refreshFixture(token);
  const outcomes = await Promise.allSettled([
    fixture.service.refreshAccessToken(token), fixture.service.refreshAccessToken(token),
  ]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 1);
});

test('legacy bcrypt refresh hash requires reconnection', async () => {
  const jwt = new JwtService();
  const token = signedRefresh(jwt, 'legacy');
  const fixture = refreshFixture(token, await bcrypt.hash(token, 10));
  await assert.rejects(() => fixture.service.refreshAccessToken(token), UnauthorizedException);
  assert.equal(fixture.session.revocationReason, 'LEGACY_REFRESH_HASH');
});

test('profile updates persist trimmed phone and bio instead of dropping them', async () => {
  let updateData: Record<string, unknown> | undefined;
  const prisma = {
    user: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateData = data;
        return {};
      },
      findUnique: async () => ({
        id: 'user-1', email: 'user@example.test', username: 'user-1', displayName: 'User One',
        firstName: 'User', lastName: 'One', primaryRole: 'NURSE', clinicId: 'clinic-1',
        phone: '+243990000000', bio: 'Infirmier référent', status: 'ACTIVE',
        Employee: [], serviceResponsabilites: [], departmentResponsibilities: [],
      }),
    },
  };

  await makeService(prisma).updateProfile('user-1', {
    phone: ' +243990000000 ',
    bio: ' Infirmier référent ',
    facebookUrl: ' https://example.test/profile ',
  });

  assert.deepEqual(updateData, {
    phone: '+243990000000',
    bio: 'Infirmier référent',
    facebookUrl: 'https://example.test/profile',
  });
});
