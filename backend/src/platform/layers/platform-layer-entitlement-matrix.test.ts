import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { AuliaLayer } from '@prisma/client';
import { PlatformLayerAccessGuard } from './platform-layer-access.guard';

const contextFor = (path: string, body: Record<string, unknown> = {}): ExecutionContext =>
  ({
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        path,
        url: path,
        body,
        headers: { authorization: 'Bearer valid-access-token' },
      }),
    }),
  }) as unknown as ExecutionContext;

const guardFor = (enabledLayers: AuliaLayer[], clinicId = 'clinic-a') =>
  new PlatformLayerAccessGuard(
    {
      getSnapshotForClinic: async (requestedClinicId: string) => ({
        configured: true,
        enabledLayers: requestedClinicId === clinicId ? enabledLayers : [],
      }),
    } as never,
    { verify: () => ({ sub: 'staff-a', type: 'access' }) } as never,
    {
      user: {
        findUnique: async () => ({
          id: 'staff-a',
          primaryRole: 'PHYSICIAN',
          clinicId,
          status: 'ACTIVE',
          deletedAt: null,
        }),
      },
    } as never,
    { getAllAndOverride: () => undefined } as never,
  );

const combinations: Array<[string, AuliaLayer[]]> = [
  ['CORE', [AuliaLayer.CORE]],
  ['CONNECTED', [AuliaLayer.CONNECTED]],
  ['DIAGNOSTIC', [AuliaLayer.DIAGNOSTIC]],
  ['CORE + CONNECTED', [AuliaLayer.CORE, AuliaLayer.CONNECTED]],
  ['CORE + DIAGNOSTIC', [AuliaLayer.CORE, AuliaLayer.DIAGNOSTIC]],
  ['CONNECTED + DIAGNOSTIC', [AuliaLayer.CONNECTED, AuliaLayer.DIAGNOSTIC]],
  ['ALL', [AuliaLayer.CORE, AuliaLayer.CONNECTED, AuliaLayer.DIAGNOSTIC]],
];

for (const [label, enabledLayers] of combinations) {
  test(`authorizes only the configured layers for ${label}`, async () => {
    const guard = guardFor(enabledLayers);
    const scenarios: Array<[AuliaLayer, string, Record<string, unknown>?]> = [
      [AuliaLayer.CORE, '/api/patients'],
      [AuliaLayer.CONNECTED, '/api/wearables/devices'],
      [AuliaLayer.DIAGNOSTIC, '/api/consultations/id', { consultationMode: 'TELECONSULTATION' }],
      [AuliaLayer.DIAGNOSTIC, '/api/intelligence'],
    ];
    for (const [layer, path, body] of scenarios) {
      const action = () => guard.canActivate(contextFor(path, body));
      if (enabledLayers.includes(layer)) {
        assert.equal(await action(), true, `${label} permits ${layer}`);
      } else {
        await assert.rejects(action, new RegExp(`La couche ${layer}`));
      }
    }
  });
}

test('does not share a clinic entitlement with another clinic', async () => {
  const clinicA = guardFor([AuliaLayer.CORE], 'clinic-a');
  await assert.rejects(
    () => clinicA.canActivate(contextFor('/api/wearables/devices')),
    /La couche CONNECTED/,
  );
});
