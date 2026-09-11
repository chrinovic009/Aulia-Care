import assert from 'node:assert/strict';
import test from 'node:test';
import { HospitalizationsService } from './hospitalizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ClinicContextService } from '../core/clinic-context.service';
import { NurseSchedulingService } from './nurse-scheduling.service';
import { BedAssignmentService } from './bed-assignment.service';
import { PatientWorkflowService } from '../core/patient-workflow.service';

const buildService = (queries: Array<Record<string, unknown>>) =>
  new HospitalizationsService(
    {
      hospitalization: {
        findFirst: async (query: Record<string, unknown>) => {
          queries.push(query);
          return null;
        },
      },
    } as unknown as PrismaService,
    {} as NotificationsService,
    {
      requireActorClinic: async () => 'clinic-a',
    } as unknown as ClinicContextService,
    {} as NurseSchedulingService,
    {} as BedAssignmentService,
    {} as PatientWorkflowService,
  );

test('nursing writes reject an hospitalization outside the actor clinic before mutation', async () => {
  const queries: Array<Record<string, unknown>> = [];
  const service = buildService(queries);

  await assert.rejects(
    () => service.recordNurseRound('hospitalization-b', 'nurse-a', {}),
    /Hospitalisation introuvable/,
  );
  await assert.rejects(
    () => service.createCareTask('hospitalization-b', { title: 'Soin', dueAt: new Date(Date.now() + 60_000).toISOString() }),
    /Hospitalisation introuvable/,
  );
  await assert.rejects(
    () => service.recordMedicationAdministration('hospitalization-b', { prescriptionLineId: 'line-b', status: 'ADMINISTERED' }, 'nurse-a'),
    /Hospitalisation introuvable/,
  );

  assert.equal(queries.length, 3);
  for (const query of queries) {
    assert.deepEqual(query.where, {
      id: 'hospitalization-b',
      patient: { clinicId: 'clinic-a' },
    });
  }
});

test('hospitalization creation rejects an invalid nurse in charge before persistence', async () => {
  let hospitalizationCreated = false;
  const service = new HospitalizationsService(
    {
      user: {
        findUnique: async () => ({ primaryRole: 'PHYSICIAN', clinicId: 'clinic-a' }),
      },
      consultation: {
        findFirst: async () => ({ patientId: 'patient-a', providerId: 'physician-a' }),
      },
      patient: {
        findFirst: async () => ({ id: 'patient-a' }),
      },
      $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
        user: {
          findFirst: async () => null,
        },
        hospitalization: {
          create: async () => {
            hospitalizationCreated = true;
            return { id: 'hospitalization-a' };
          },
        },
      }),
    } as unknown as PrismaService,
    {} as NotificationsService,
    {} as ClinicContextService,
    {} as NurseSchedulingService,
    {
      assertAvailable: async () => ({ id: 'bed-a', code: 'A-01' }),
    } as unknown as BedAssignmentService,
    {} as PatientWorkflowService,
  );

  await assert.rejects(
    () => service.create(
      {
        consultationId: 'consultation-a',
        patientId: 'patient-a',
        admissionReason: 'Observation',
        bedId: 'bed-a',
        nurseInChargeId: 'nurse-from-clinic-b',
      },
      'physician-a',
    ),
    /Infirmier responsable indisponible/,
  );
  assert.equal(hospitalizationCreated, false);
});

test('hospitalization creation rejects a free-text bed number without a real bed', async () => {
  let transactionStarted = false;
  const service = new HospitalizationsService(
    {
      user: {
        findUnique: async () => ({ primaryRole: 'PHYSICIAN', clinicId: 'clinic-a' }),
      },
      consultation: {
        findFirst: async () => ({ patientId: 'patient-a', providerId: 'physician-a' }),
      },
      patient: {
        findFirst: async () => ({ id: 'patient-a' }),
      },
      $transaction: async () => {
        transactionStarted = true;
        throw new Error('A real bed is required before opening a transaction.');
      },
    } as unknown as PrismaService,
    {} as NotificationsService,
    {} as ClinicContextService,
    {} as NurseSchedulingService,
    {} as BedAssignmentService,
    {} as PatientWorkflowService,
  );

  await assert.rejects(
    () => service.create(
      {
        consultationId: 'consultation-a',
        patientId: 'patient-a',
        admissionReason: 'Observation',
        bedNumber: 'A-01',
      } as any,
      'physician-a',
    ),
    /lit réel doit être sélectionné/,
  );
  assert.equal(transactionStarted, false);
});

test('hospitalization update rejects a nurse without an active compatible employee assignment', async () => {
  const nurseQueries: Array<Record<string, unknown>> = [];
  let transactionStarted = false;
  const service = new HospitalizationsService(
    {
      user: {
        findFirst: async (query: Record<string, unknown>) => {
          nurseQueries.push(query);
          return null;
        },
      },
      $transaction: async () => {
        transactionStarted = true;
        throw new Error('Invalid nurse assignment must be rejected before persistence.');
      },
    } as unknown as PrismaService,
    {} as NotificationsService,
    {
      requireOperationalActor: async () => ({
        id: 'physician-a',
        clinicId: 'clinic-a',
        primaryRole: 'PHYSICIAN',
      }),
    } as unknown as ClinicContextService,
    {} as NurseSchedulingService,
    {} as BedAssignmentService,
    {} as PatientWorkflowService,
  );
  (service as any).findOneForActor = async () => ({
    id: 'hospitalization-a',
    physicianId: 'physician-a',
    serviceUnitId: 'unit-a',
    status: 'ADMITTED',
  });

  await assert.rejects(
    () => service.update('hospitalization-a', { nurseInChargeId: 'nurse-a' }, 'physician-a'),
    /Infirmier introuvable dans cet établissement/,
  );
  assert.equal(transactionStarted, false);
  assert.deepEqual(nurseQueries[0]?.where, {
    id: 'nurse-a',
    clinicId: 'clinic-a',
    primaryRole: 'NURSE',
    status: 'ACTIVE',
    deletedAt: null,
    Employee: {
      some: {
        status: 'ACTIVE',
        clinicId: 'clinic-a',
        OR: [{ serviceUnitId: 'unit-a' }, { serviceUnitId: null }],
      },
    },
  });
});

test('hospitalization stats scope rooms and beds to the actor clinic', async () => {
  const roomQueries: Array<Record<string, unknown>> = [];
  const bedQueries: Array<Record<string, unknown>> = [];
  const service = new HospitalizationsService(
    {
      hospitalization: {
        count: async () => 2,
      },
      room: {
        count: async (query: Record<string, unknown>) => {
          roomQueries.push(query);
          return 3;
        },
      },
      bed: {
        count: async (query?: Record<string, unknown>) => {
          bedQueries.push(query || {});
          return bedQueries.length === 1 ? 4 : 1;
        },
      },
    } as unknown as PrismaService,
    {} as NotificationsService,
    {
      requireActorClinic: async () => 'clinic-a',
    } as unknown as ClinicContextService,
    {} as NurseSchedulingService,
    {} as BedAssignmentService,
    {} as PatientWorkflowService,
  );

  const stats = await service.getStats({ userId: 'doctor-a' });

  assert.deepEqual(roomQueries[0]?.where, {
    serviceUnit: { clinicId: 'clinic-a' },
    status: 'AVAILABLE',
  });
  assert.deepEqual(bedQueries[0]?.where, {
    room: { serviceUnit: { clinicId: 'clinic-a' } },
  });
  assert.deepEqual(bedQueries[1]?.where, {
    room: { serviceUnit: { clinicId: 'clinic-a' } },
    status: 'OCCUPIED',
  });
  assert.equal(stats.capacityRate, 25);
});
