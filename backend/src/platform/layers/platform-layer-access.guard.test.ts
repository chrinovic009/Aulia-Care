import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { PlatformLayerAccessGuard } from './platform-layer-access.guard';

const contextFor = (path: string, body: Record<string, unknown> = {}): ExecutionContext => ({
  getType: () => 'http',
  switchToHttp: () => ({ getRequest: () => ({ path, url: path, body, headers: { authorization: 'Bearer valid-access-token' } }) }),
} as unknown as ExecutionContext);

const guardFor = (enabledLayers: string[], configured = true) => {
  const layers = { getSnapshotForClinic: async () => ({ configured, enabledLayers }) };
  const jwt = { verify: () => ({ sub: 'staff-a', type: 'access' }) };
  const prisma = { user: { findUnique: async () => ({ primaryRole: 'PHYSICIAN', clinicId: 'clinic-a', status: 'ACTIVE', deletedAt: null }) } };
  return new PlatformLayerAccessGuard(layers as never, jwt as never, prisma as never);
};

test('refuses AI and Connected routes when a Core-only installation is configured', async () => {
  const guard = guardFor(['CORE']);
  await assert.rejects(() => guard.canActivate(contextFor('/api/wearables/devices')));
  await assert.rejects(() => guard.canActivate(contextFor('/api/consultations/id/telehealth-transcript')));
  await assert.rejects(() => guard.canActivate(contextFor('/api/consultations/id', { encounterType: 'TELEHEALTH' })));
  assert.equal(await guard.canActivate(contextFor('/api/patients')), true);
});

test('fails closed for optional layers before a DEV configuration exists', async () => {
  const guard = guardFor([], false);
  await assert.rejects(() => guard.canActivate(contextFor('/api/wearables/devices')));
  await assert.rejects(() => guard.canActivate(contextFor('/api/consultations/id', { consultationMode: 'TELECONSULTATION' })));
  await assert.rejects(() => guard.canActivate(contextFor('/api/patients')));
});

test('allows an optional layer only when it is explicitly enabled', async () => {
  const guard = guardFor(['CORE', 'AI', 'CONNECTED']);
  assert.equal(await guard.canActivate(contextFor('/api/wearables/devices')), true);
  assert.equal(await guard.canActivate(contextFor('/api/consultations/id', { consultationMode: 'TELECONSULTATION' })), true);
});

test('allows AI and Connected together without silently granting Core', async () => {
  const guard = guardFor(['AI', 'CONNECTED']);
  assert.equal(await guard.canActivate(contextFor('/api/wearables/devices')), true);
  assert.equal(await guard.canActivate(contextFor('/api/intelligence')), true);
  await assert.rejects(() => guard.canActivate(contextFor('/api/patients')));
});
