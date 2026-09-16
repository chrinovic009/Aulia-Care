import assert from 'node:assert/strict';
import test from 'node:test';
import { RoleSlug } from '@prisma/client';
import { UsersService } from './users.service';

test('staff directory never includes a portal patient from another clinic, even with a corrupt care relation', async () => {
  const patientA = {
    id: 'patient-a',
    clinicId: 'clinic-a',
    firstName: 'Patient',
    middleName: null,
    lastName: 'Alpha',
    email: 'patient-a@example.test',
    phone: '+243810000001',
    portalUserId: 'portal-a',
    workflowStatus: 'EN_ATTENTE_MEDECIN',
    priority: null,
  };
  const patientBWithCorruptDoctorRelation = {
    ...patientA,
    id: 'patient-b',
    clinicId: 'clinic-b',
    lastName: 'Bravo',
    email: 'patient-b@example.test',
    portalUserId: 'portal-b',
  };
  const requestedPatientWheres: Array<Record<string, unknown>> = [];

  const service = new UsersService({
    user: {
      findUnique: async () => ({
        id: 'staff-a',
        clinicId: 'clinic-a',
        primaryRole: RoleSlug.PHYSICIAN,
        status: 'ACTIVE',
        deletedAt: null,
      }),
      findMany: async () => [],
    },
    patient: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        requestedPatientWheres.push(where);
        // This deliberately models corrupted historical data: doctor A is
        // referenced by a Clinic B relation. Only the Patient.clinicId fence
        // may decide which portal contacts are returned.
        return where.clinicId === 'clinic-a'
          ? [patientA]
          : [patientA, patientBWithCorruptDoctorRelation];
      },
    },
    chatMessage: { findMany: async () => [] },
  } as never);

  const contacts = await service.findContactsForRole(
    RoleSlug.PHYSICIAN,
    'staff-a',
  );

  assert.deepEqual(
    contacts.map((contact) => contact.id),
    ['portal-a'],
  );
  assert.ok(requestedPatientWheres.some((where) => where.clinicId === 'clinic-a'));
  assert.ok(
    requestedPatientWheres.every((where) => where.clinicId === 'clinic-a'),
    'every Patient directory query must be constrained by the authenticated clinic',
  );
});
