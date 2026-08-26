import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
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

test('reusing a consumed refresh token revokes the server session', async () => {
  const replayedToken = 'consumed-refresh-token';
  const oldHash = await bcrypt.hash(replayedToken, 10);
  const currentHash = await bcrypt.hash('current-refresh-token', 10);
  let revoked: Record<string, unknown> | undefined;
  const prisma = {
    session: {
      findFirst: async () => ({ id: 'session-1', tokenHash: currentHash }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        revoked = data;
        return {};
      },
    },
    sessionRefreshTokenHistory: {
      findMany: async () => [{ tokenHash: oldHash }],
    },
    auditTrail: { create: async () => ({}) },
  };

  await assert.rejects(
    () => makeService(prisma).refreshAccessToken(replayedToken),
    (error: unknown) => error instanceof UnauthorizedException,
  );
  assert.equal(revoked?.status, 'REVOKED');
  assert.equal(revoked?.revocationReason, 'REFRESH_TOKEN_REUSE');
});
