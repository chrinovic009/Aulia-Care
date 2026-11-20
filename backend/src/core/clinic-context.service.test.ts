import test from 'node:test';
import assert from 'node:assert/strict';
import { ClinicContextService } from './clinic-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoleSlug } from '@prisma/client';
import { ROLE_KIND, isStaffRole } from './tenant-roles';

test('director grant is read from current database roles without changing profession', async () => {
  let granted = true;
  const client = { user: { findUnique: async () => ({ id: 'd', clinicId: 'c', primaryRole: 'PHYSICIAN', status: 'ACTIVE', deletedAt: null, roles: granted ? [{role: {slug: 'MEDICAL_DIRECTOR'}}] : [] }) } } as unknown as PrismaService;
  const core = new ClinicContextService(client);
  assert.equal((await core.requireMedicalDirector('d')).primaryRole, 'PHYSICIAN');
  granted = false;
  await assert.rejects(() => core.requireMedicalDirector('d'), /directeur/);
});
test('every role is classified; director is an additional grant, not a staff profession', () => {
  assert.deepEqual(Object.keys(ROLE_KIND).sort(), Object.values(RoleSlug).sort());
  assert.equal(isStaffRole('PHYSICIAN'), true);
  assert.equal(isStaffRole('MEDICAL_DIRECTOR'), false);
  assert.equal(isStaffRole('ADMIN'), false);
  assert.equal(isStaffRole('UNKNOWN'), false);
});
