import assert from 'node:assert/strict';
import test from 'node:test';
import { WearablesService } from './wearables.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicContextService } from '../core/clinic-context.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

test('a wearable plan is written only in the authenticated clinic', async () => {
  const planQueries: Array<Record<string, unknown>> = [];
  const lotQueries: Array<Record<string, unknown>> = [];
  const service = new WearablesService(
    {
      wearablePlan: {
        upsert: async (query: Record<string, unknown>) => {
          planQueries.push(query);
          return { id: 'plan-a' };
        },
      },
      wearableLot: {
        updateMany: async (query: Record<string, unknown>) => {
          lotQueries.push(query);
          return { count: 0 };
        },
      },
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    {
      requireOperationalActor: async () => ({
        id: 'admin-a',
        clinicId: 'clinic-a',
        primaryRole: 'ADMIN',
      }),
    } as unknown as ClinicContextService,
  );

  await service.savePlan('APPLE', { monthlyPrice: 25_000 }, 'admin-a');

  assert.deepEqual(planQueries[0]?.where, {
    clinicId_manufacturer: { clinicId: 'clinic-a', manufacturer: 'APPLE' },
  });
  assert.deepEqual(lotQueries[0]?.where, {
    clinicId: 'clinic-a',
    manufacturer: 'APPLE',
    planId: null,
  });
});

test('reception cannot pair a watch that belongs to another clinic', async () => {
  const inventoryQueries: Array<Record<string, unknown>> = [];
  const service = new WearablesService(
    {
      wearableInventoryDevice: {
        findFirst: async (query: Record<string, unknown>) => {
          inventoryQueries.push(query);
          return null;
        },
      },
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    {
      requireOperationalActor: async () => ({
        id: 'reception-a',
        clinicId: 'clinic-a',
        primaryRole: 'RECEPTIONIST',
      }),
    } as unknown as ClinicContextService,
  );

  await assert.rejects(
    () => service.pairDeviceAtReception({ patientId: 'patient-a', assetCode: 'AULIA-APPLE-OTHER-CLINIC' }, 'reception-a'),
    /parc Aulia Care/,
  );

  assert.deepEqual(inventoryQueries[0]?.where, {
    serialNumber: 'AULIA-APPLE-OTHER-CLINIC',
    lot: { clinicId: 'clinic-a' },
  });
});
