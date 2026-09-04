import assert from 'node:assert/strict';
import test from 'node:test';
import { PatientsService } from './patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ClinicContextService } from '../core/clinic-context.service';

test('patient portal never links a medical record from a matching e-mail address', async () => {
  const patientLookups: Array<Record<string, unknown>> = [];
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'portal-user-a',
        primaryRole: 'PATIENT',
        status: 'ACTIVE',
        deletedAt: null,
        email: 'same-address@example.test',
      }),
    },
    patient: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        patientLookups.push(args.where);
        return null;
      },
    },
  };
  const notifications = {};
  const clinicContext = {};
  const service = new PatientsService(
    prisma as unknown as PrismaService,
    notifications as NotificationsGateway,
    clinicContext as ClinicContextService,
  );

  await assert.rejects(
    () => service.getPatientProfileForUser('portal-user-a'),
    /explicitement lié/,
  );

  assert.deepEqual(patientLookups, [
    {
      portalUserId: 'portal-user-a',
      deletedAt: null,
    },
  ]);
});

test('daily check-in notifies only active nurses from the patient clinic after commit', async () => {
  const recipientQueries: Array<Record<string, unknown>> = [];
  const createdNotifications: Array<{ recipientId: string }> = [];
  const emittedNotifications: string[] = [];

  const transaction = {
    patient: {
      findFirst: async () => ({ id: 'patient-a', clinicId: 'clinic-a' }),
    },
    medicalHistory: {
      create: async () => ({ id: 'checkin-a', eventDate: new Date('2026-09-04T08:00:00.000Z') }),
    },
    hospitalization: {
      findFirst: async () => ({
        nurseInChargeId: 'nurse-a',
        nurseAssignments: [{ nurseId: 'nurse-b-from-another-clinic' }],
      }),
    },
    user: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        recipientQueries.push(args.where);
        return [{ id: 'nurse-a' }];
      },
    },
    notification: {
      create: async ({ data }: { data: { recipientId: string } }) => {
        const notification = { id: `notification-${data.recipientId}`, recipientId: data.recipientId };
        createdNotifications.push(notification);
        return notification;
      },
    },
  };

  const prisma = {
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  };
  const notifications = {
    notifyToUser: (recipientId: string) => emittedNotifications.push(recipientId),
  };
  const service = new PatientsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsGateway,
    {} as ClinicContextService,
  );
  const portalService = service as unknown as {
    getPatientProfileForUser: (userId: string) => Promise<{ id: string; clinicId: string }>;
  };
  portalService.getPatientProfileForUser = async () => ({ id: 'patient-a', clinicId: 'clinic-a' });

  const result = await service.createDailyCheckin('portal-user-a', {
    feelsWell: false,
    symptoms: ['Fièvre', ' Fièvre '],
  });

  assert.equal(result.recipientsNotified, 1);
  assert.deepEqual(createdNotifications, [{ recipientId: 'nurse-a' }]);
  assert.deepEqual(emittedNotifications, ['nurse-a']);
  assert.equal(recipientQueries.length, 1);
  assert.deepEqual(recipientQueries[0], {
    id: { in: ['nurse-a', 'nurse-b-from-another-clinic'] },
    clinicId: 'clinic-a',
    status: 'ACTIVE',
    deletedAt: null,
    OR: [
      { primaryRole: 'NURSE' },
      { roles: { some: { active: true, role: { slug: 'NURSE' } } } },
    ],
  });
});
