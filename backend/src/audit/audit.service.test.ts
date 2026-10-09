import assert from 'node:assert/strict';
import test from 'node:test';
import { AuditService } from './audit.service';

test('audit listing is tenant scoped from the authenticated actor, never globally', async () => {
  let capturedWhere: unknown;
  const service = new AuditService({
    user: { findFirst: async () => ({ clinicId: 'clinic-a' }) },
    auditLog: {
      findMany: async ({ where }: { where: unknown }) => {
        capturedWhere = where;
        return [];
      },
    },
  } as never);

  await service.findAll('admin-a');
  assert.deepEqual(capturedWhere, {
    AND: [
      { OR: [{ actorId: null }, { actor: { clinicId: 'clinic-a' } }] },
      { OR: [{ patientId: null }, { patient: { clinicId: 'clinic-a' } }] },
      { OR: [{ actor: { clinicId: 'clinic-a' } }, { patient: { clinicId: 'clinic-a' } }] },
    ],
  });
});

test('audit detail lookup combines the log id with the authenticated clinic scope', async () => {
  let capturedWhere: unknown;
  const service = new AuditService({
    user: { findFirst: async () => ({ clinicId: 'clinic-a' }) },
    auditLog: {
      findFirst: async ({ where }: { where: unknown }) => {
        capturedWhere = where;
        return { id: 'audit-a' };
      },
    },
  } as never);

  await service.findOne('audit-a', 'admin-a');
  assert.deepEqual(capturedWhere, {
    id: 'audit-a',
    AND: [
      { OR: [{ actorId: null }, { actor: { clinicId: 'clinic-a' } }] },
      { OR: [{ patientId: null }, { patient: { clinicId: 'clinic-a' } }] },
      { OR: [{ actor: { clinicId: 'clinic-a' } }, { patient: { clinicId: 'clinic-a' } }] },
    ],
  });
});
