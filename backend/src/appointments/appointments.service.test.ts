import assert from 'node:assert/strict';
import test from 'node:test';

import { PatientWorkflowStatus } from '@prisma/client';

import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ClinicContextService } from '../core/clinic-context.service';
import { PatientWorkflowService } from '../core/patient-workflow.service';

test('appointment listing is restricted to the operational clinic', async () => {
  const queries: Array<Record<string, unknown>> = [];

  const service = new AppointmentsService(
    {
      appointment: {
        findMany: async (query: Record<string, unknown>) => {
          queries.push(query);
          return [];
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
    {} as PatientWorkflowService,
  );

  await service.findAll('reception-a');

  assert.deepEqual(queries[0]?.where, {
    clinicId: 'clinic-a',
    deletedAt: null,
  });
});

test('appointment creation refuses a patient from another clinic before creating any visit', async () => {
  const patientQueries: Array<Record<string, unknown>> = [];
  let transactionStarted = false;

  const service = new AppointmentsService(
    {
      user: {
        findUnique: async () => ({
          id: 'reception-a',
          primaryRole: 'RECEPTIONIST',
          status: 'ACTIVE',
          deletedAt: null,
        }),
      },

      patient: {
        findFirst: async (query: Record<string, unknown>) => {
          patientQueries.push(query);
          return null;
        },
      },

      $transaction: async () => {
        transactionStarted = true;

        throw new Error(
          'A cross-clinic patient must be rejected before a transaction starts.',
        );
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

    {} as PatientWorkflowService,
  );

  await assert.rejects(
    () =>
      service.create(
        {
          patientId: 'patient-b',
          scheduledAt: '2026-09-08T10:00:00.000Z',
          durationMinutes: 30,
        },
        'reception-a',
      ),
    /introuvable dans cet établissement/,
  );

  assert.equal(transactionStarted, false);

  assert.deepEqual(patientQueries[0]?.where, {
    id: 'patient-b',
    clinicId: 'clinic-a',
    deletedAt: null,
  });
});

test('appointment workflow recalculation handles cancellation and reassignment', async () => {
  const updates: Array<{
    data: {
      workflowStatus: PatientWorkflowStatus;
    };
  }> = [];

  const service = new AppointmentsService(
    {} as PrismaService,
    {} as NotificationsGateway,
    {} as ClinicContextService,
    new PatientWorkflowService(),
  );

  await (service as any).syncPatientWorkflowFromAppointments(
    {
      $executeRaw: async () => undefined,

      patient: {
        findFirst: async () => ({
          workflowStatus:
            PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
        }),

        updateMany: async (query: {
          data: {
            workflowStatus: PatientWorkflowStatus;
          };
        }) => {
          updates.push(query);

          return {
            count: 1,
          };
        },
      },

      appointment: {
        findFirst: async () => null,
      },
    },

    'patient-a',
    'clinic-a',
    PatientWorkflowStatus.ANNULE,
  );

  await (service as any).syncPatientWorkflowFromAppointments(
    {
      $executeRaw: async () => undefined,

      patient: {
        findFirst: async () => ({
          workflowStatus:
            PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
        }),

        updateMany: async (query: {
          data: {
            workflowStatus: PatientWorkflowStatus;
          };
        }) => {
          updates.push(query);

          return {
            count: 1,
          };
        },
      },

      appointment: {
        findFirst: async () => ({
          serviceUnit: {
            name: 'Laboratoire central',
          },
        }),
      },
    },

    'patient-a',
    'clinic-a',
    PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
  );

  assert.equal(
    updates[0]?.data.workflowStatus,
    PatientWorkflowStatus.ANNULE,
  );

  assert.equal(
    updates[1]?.data.workflowStatus,
    PatientWorkflowStatus.EN_LABORATOIRE,
  );
});

test('appointment collision check acquires a transaction lock before reading candidates', async () => {
  const events: string[] = [];

  const service = new AppointmentsService(
    {} as PrismaService,
    {} as NotificationsGateway,
    {} as ClinicContextService,
    {} as PatientWorkflowService,
  );

  await (service as any).assertNoServiceUnitCollision(
    {
      $executeRaw: async () => {
        events.push('lock');
      },

      appointment: {
        findMany: async () => {
          events.push('read');
          return [];
        },
      },
    },

    'clinic-a',
    'unit-a',
    new Date('2026-09-11T10:00:00.000Z'),
    30,
  );

  assert.deepEqual(events, ['lock', 'read']);
});