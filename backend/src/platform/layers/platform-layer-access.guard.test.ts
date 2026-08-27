import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { PlatformLayerAccessGuard } from './platform-layer-access.guard';

const contextFor = (path: string, body: Record<string, unknown> = {}): ExecutionContext => ({
  getType: () => 'http',
  switchToHttp: () => ({ getRequest: () => ({ path, url: path, body }) }),
} as unknown as ExecutionContext);

test('refuses AI and Connected routes when a Core-only installation is configured', async () => {
  const layers = { getSnapshot: async () => ({ configured: true, enabledLayers: ['CORE'] }) };
  const guard = new PlatformLayerAccessGuard(layers as never);
  await assert.rejects(() => guard.canActivate(contextFor('/api/wearables/devices')));
  await assert.rejects(() => guard.canActivate(contextFor('/api/consultations/id/telehealth-transcript')));
  await assert.rejects(() => guard.canActivate(contextFor('/api/consultations/id', { encounterType: 'TELEHEALTH' })));
  assert.equal(await guard.canActivate(contextFor('/api/patients')), true);
});

test('fails closed for optional layers before a DEV configuration exists', async () => {
  const layers = { getSnapshot: async () => ({ configured: false, enabledLayers: ['CORE'] }) };
  const guard = new PlatformLayerAccessGuard(layers as never);
  await assert.rejects(() => guard.canActivate(contextFor('/api/wearables/devices')));
  await assert.rejects(() => guard.canActivate(contextFor('/api/consultations/id', { consultationMode: 'TELECONSULTATION' })));
  assert.equal(await guard.canActivate(contextFor('/api/patients')), true);
});

test('allows an optional layer only when it is explicitly enabled', async () => {
  const layers = { getSnapshot: async () => ({ configured: true, enabledLayers: ['CORE', 'AI', 'CONNECTED'] }) };
  const guard = new PlatformLayerAccessGuard(layers as never);
  assert.equal(await guard.canActivate(contextFor('/api/wearables/devices')), true);
  assert.equal(await guard.canActivate(contextFor('/api/consultations/id', { consultationMode: 'TELECONSULTATION' })), true);
});
