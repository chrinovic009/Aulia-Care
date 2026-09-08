import assert from 'node:assert/strict';
import test from 'node:test';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ClinicContextService } from '../core/clinic-context.service';

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
        throw new Error('A cross-clinic patient must be rejected before a transaction starts.');
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
