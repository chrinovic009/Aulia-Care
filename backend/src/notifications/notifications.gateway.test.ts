import assert from 'node:assert/strict';
import test from 'node:test';
import { AuliaLayer } from '@prisma/client';
import { NotificationsGateway } from './notifications.gateway';

type GatewayWithEntitlementCheck = {
  requireDiagnosticAgentForTelehealth(userId?: string, clinicId?: string): Promise<void>;
};

const gatewayFor = (enabledLayers: AuliaLayer[], actorClinicId: string | null = 'clinic-a') => {
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'actor-a',
        clinicId: actorClinicId,
        primaryRole: 'PHYSICIAN',
        status: 'ACTIVE',
        deletedAt: null,
      }),
    },
  };
  const layers = {
    getSnapshotForClinic: async () => ({
      configured: true,
      enabledLayers,
      availableLayers: [AuliaLayer.CORE, AuliaLayer.CONNECTED, AuliaLayer.DIAGNOSTIC],
      configurationVersion: 1,
      configuredAt: new Date(),
      updatedAt: new Date(),
    }),
  };

  return new NotificationsGateway(
    {} as never,
    prisma as never,
    {} as never,
    {} as never,
    layers as never,
  ) as unknown as GatewayWithEntitlementCheck;
};

test('denies telehealth Socket.IO activity when Diagnostic Agent is absent', async () => {
  const gateway = gatewayFor([AuliaLayer.CORE]);
  await assert.rejects(
    () => gateway.requireDiagnosticAgentForTelehealth('actor-a', 'clinic-a'),
    /Diagnostic Agent/,
  );
});

test('permits telehealth Socket.IO activity only for the current clinic entitlement', async () => {
  const gateway = gatewayFor([AuliaLayer.DIAGNOSTIC]);
  await assert.doesNotReject(
    () => gateway.requireDiagnosticAgentForTelehealth('actor-a', 'clinic-a'),
  );
});

test('denies an operational Socket.IO user from another clinic', async () => {
  const gateway = gatewayFor([AuliaLayer.DIAGNOSTIC], 'clinic-b');
  await assert.rejects(
    () => gateway.requireDiagnosticAgentForTelehealth('actor-a', 'clinic-a'),
    /hors établissement/,
  );
});

test('refuses a WebSocket upgrade when its JWT session was revoked or PIN-locked', async () => {
  const disconnected: boolean[] = [];
  const client = {
    id: 'socket-1',
    data: {},
    handshake: { headers: { authorization: 'Bearer access-token' } },
    disconnect: (closed: boolean) => { disconnected.push(closed); },
    join: () => undefined,
    emit: () => undefined,
  };
  const gateway = new NotificationsGateway(
    {} as never,
    {
      user: {
        findUnique: async () => ({
          id: 'user-a', email: 'a@example.test', status: 'ACTIVE', deletedAt: null,
          clinicId: 'clinic-a', primaryRole: 'NURSE',
        }),
      },
      session: {
        // `null` represents either a revoked, expired or PIN-locked session.
        findFirst: async () => null,
      },
    } as never,
    { verifyAsync: async () => ({ sub: 'user-a', sid: 'revoked-session' }) } as never,
    { getOrThrow: () => 'test-secret' } as never,
    {} as never,
  );

  await gateway.handleConnection(client as never);
  assert.deepEqual(disconnected, [true]);
});

test('registers a WebSocket only after a live, unlocked persisted session is verified', async () => {
  const joined: string[] = [];
  const disconnected: boolean[] = [];
  const client = {
    id: 'socket-2',
    data: {},
    handshake: { headers: { authorization: 'Bearer access-token' } },
    disconnect: (closed: boolean) => { disconnected.push(closed); },
    join: (room: string) => { joined.push(room); },
    emit: () => undefined,
  };
  const gateway = new NotificationsGateway(
    {} as never,
    {
      user: {
        findUnique: async () => ({
          id: 'user-a', email: 'a@example.test', status: 'ACTIVE', deletedAt: null,
          clinicId: 'clinic-a', primaryRole: 'NURSE',
        }),
      },
      session: { findFirst: async () => ({ id: 'session-a' }) },
    } as never,
    { verifyAsync: async () => ({ sub: 'user-a', sid: 'session-a' }) } as never,
    { getOrThrow: () => 'test-secret' } as never,
    {} as never,
  );

  await gateway.handleConnection(client as never);
  assert.deepEqual(disconnected, []);
  assert.deepEqual(joined, ['user:user-a', 'clinic:clinic-a:domain:clinical']);
});

test('realtime direct-user delivery filters a corrupt cross-clinic recipient before emitting', async () => {
  const gateway = new NotificationsGateway(
    {} as never,
    {
      user: {
        findMany: async () => [{ id: 'user-a' }],
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as {
    filterAudienceUserIds(userIds: string[], clinicId?: string): Promise<string[]>;
  };

  assert.deepEqual(
    await gateway.filterAudienceUserIds(['user-a', 'user-b', 'user-a'], 'clinic-a'),
    ['user-a'],
  );
});
