import assert from 'node:assert/strict';

import test from 'node:test';

import type { ExecutionContext } from '@nestjs/common';

import { PlatformLayerAccessGuard } from './platform-layer-access.guard';

const contextFor = (
  path: string,
  body: Record<string, unknown> = {},
): ExecutionContext =>
  ({
    getType: () => 'http',

    switchToHttp: () => ({
      getRequest: () => ({
        path,
        url: path,
        body,
        headers: {
          authorization: 'Bearer valid-access-token',
        },
      }),
    }),
  }) as unknown as ExecutionContext;

const guardFor = (
  enabledLayers: string[],
  configured = true,
) => {
  const layers = {
    getSnapshotForClinic: async () => ({
      configured,
      enabledLayers,
    }),
  };

  const jwt = {
    verify: () => ({
      sub: 'staff-a',
      type: 'access',
    }),
  };

  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'staff-a',
        primaryRole: 'PHYSICIAN',
        clinicId: 'clinic-a',
        status: 'ACTIVE',
        deletedAt: null,
      }),
    },
  };

  return new PlatformLayerAccessGuard(
    layers as never,
    jwt as never,
    prisma as never,
  );
};

test(
  'refuses AI and Connected routes when a Core-only installation is configured',
  async () => {
    const guard = guardFor(['CORE']);

    await assert.rejects(() =>
      guard.canActivate(
        contextFor('/api/wearables/devices'),
      ),
    );

    await assert.rejects(() =>
      guard.canActivate(
        contextFor(
          '/api/consultations/id/telehealth-transcript',
        ),
      ),
    );

    await assert.rejects(() =>
      guard.canActivate(
        contextFor('/api/consultations/id', {
          encounterType: 'TELEHEALTH',
        }),
      ),
    );

    assert.equal(
      await guard.canActivate(
        contextFor('/api/patients'),
      ),
      true,
    );
  },
);

test(
  'fails closed for optional layers before a DEV configuration exists',
  async () => {
    const guard = guardFor([], false);

    await assert.rejects(() =>
      guard.canActivate(
        contextFor('/api/wearables/devices'),
      ),
    );

    await assert.rejects(() =>
      guard.canActivate(
        contextFor('/api/consultations/id', {
          consultationMode: 'TELECONSULTATION',
        }),
      ),
    );

    await assert.rejects(() =>
      guard.canActivate(
        contextFor('/api/patients'),
      ),
    );
  },
);

test(
  'allows an optional layer only when it is explicitly enabled',
  async () => {
    const guard = guardFor([
      'CORE',
      'AI',
      'CONNECTED',
    ]);

    assert.equal(
      await guard.canActivate(
        contextFor('/api/wearables/devices'),
      ),
      true,
    );

    assert.equal(
      await guard.canActivate(
        contextFor('/api/consultations/id', {
          consultationMode: 'TELECONSULTATION',
        }),
      ),
      true,
    );
  },
);

test(
  'allows AI and Connected together without silently granting Core',
  async () => {
    const guard = guardFor([
      'AI',
      'CONNECTED',
    ]);

    assert.equal(
      await guard.canActivate(
        contextFor('/api/wearables/devices'),
      ),
      true,
    );

    assert.equal(
      await guard.canActivate(
        contextFor('/api/intelligence'),
      ),
      true,
    );

    await assert.rejects(() =>
      guard.canActivate(
        contextFor('/api/patients'),
      ),
    );
  },
);

test(
  'authorizes a patient portal only through its explicit Patient.portalUserId relation',
  async () => {
    const layers = {
      getSnapshotForClinic: async () => ({
        configured: true,
        enabledLayers: ['CORE'],
      }),
    };

    const jwt = {
      verify: () => ({
        sub: 'portal-user-a',
        type: 'access',
      }),
    };

    const prisma = {
      user: {
        findUnique: async () => ({
          id: 'portal-user-a',
          primaryRole: 'PATIENT',
          clinicId: null,
          status: 'ACTIVE',
          deletedAt: null,
        }),
      },

      patient: {
        findFirst: async () => ({
          clinicId: 'clinic-a',
        }),
      },
    };

    const guard =
      new PlatformLayerAccessGuard(
        layers as never,
        jwt as never,
        prisma as never,
      );

    assert.equal(
      await guard.canActivate(
        contextFor('/api/patients/me/profile'),
      ),
      true,
    );

    await assert.rejects(() =>
      guard.canActivate(
        contextFor('/api/patients'),
      ),
    );
  },
);

test(
  'fails closed when an explicitly linked patient has no clinic',
  async () => {
    const layers = {
      getSnapshotForClinic: async () => ({
        configured: true,
        enabledLayers: ['CORE'],
      }),
    };

    const jwt = {
      verify: () => ({
        sub: 'portal-user-orphan',
        type: 'access',
      }),
    };

    const prisma = {
      user: {
        findUnique: async () => ({
          id: 'portal-user-orphan',
          primaryRole: 'PATIENT',
          clinicId: null,
          status: 'ACTIVE',
          deletedAt: null,
        }),
      },

      patient: {
        findFirst: async () => ({
          clinicId: null,
        }),
      },
    };

    const guard =
      new PlatformLayerAccessGuard(
        layers as never,
        jwt as never,
        prisma as never,
      );

    await assert.rejects(() =>
      guard.canActivate(
        contextFor('/api/patients/me/profile'),
      ),
    );
  },
);