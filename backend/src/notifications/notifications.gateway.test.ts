import assert from 'node:assert/strict';
import test from 'node:test';
import { AuliaLayer } from '@prisma/client';
import { NotificationsGateway } from './notifications.gateway';

type GatewayWithEntitlementCheck = {
  requireConnectedCareForTelehealth(userId?: string, clinicId?: string): Promise<void>;
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

test('denies telehealth Socket.IO activity when Connected Care is absent', async () => {
  const gateway = gatewayFor([AuliaLayer.CORE]);
  await assert.rejects(
    () => gateway.requireConnectedCareForTelehealth('actor-a', 'clinic-a'),
    /Connected Care/,
  );
});

test('permits telehealth Socket.IO activity only for the current clinic entitlement', async () => {
  const gateway = gatewayFor([AuliaLayer.CONNECTED]);
  await assert.doesNotReject(
    () => gateway.requireConnectedCareForTelehealth('actor-a', 'clinic-a'),
  );
});

test('denies an operational Socket.IO user from another clinic', async () => {
  const gateway = gatewayFor([AuliaLayer.CONNECTED], 'clinic-b');
  await assert.rejects(
    () => gateway.requireConnectedCareForTelehealth('actor-a', 'clinic-a'),
    /hors établissement/,
  );
});
