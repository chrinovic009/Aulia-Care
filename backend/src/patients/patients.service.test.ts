import assert from 'node:assert/strict';
import test from 'node:test';
import { PatientsService } from './patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ClinicContextService } from '../core/clinic-context.service';
import { PatientWorkflowService } from '../core/patient-workflow.service';

test('cashier queue is invoice-driven, clinic-scoped and includes imaging during consultation', async () => {
  let patientQuery: Record<string, unknown> | undefined;
  const service = new PatientsService(
    {
      user: { findUnique: async () => ({ clinicId: 'clinic-a', status: 'ACTIVE', deletedAt: null }) },
      patient: { findMany: async (query: Record<string, unknown>) => {
        patientQuery = query;
        return [{
          id: 'patient-a', firstName: 'A', lastName: 'Patient',
          workflowStatus: 'EN_CONSULTATION', arrivalAt: new Date(), createdAt: new Date(),
          invoices: [{ id: 'imaging-a', type: 'RADIOLOGY', totalAmount: 100, balanceDue: 100,
            status: 'PENDING', issuedAt: new Date(), dueDate: null }],
          service: null, receptionist: null,
        }];
      } },
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    { requireOperationalActor: async () => ({ id: 'cashier-a', clinicId: 'clinic-a' }) } as unknown as ClinicContextService,
    {} as PatientWorkflowService,
  );

  const result = await service.getPatientsAwaitingPayment({ userId: 'cashier-a' });
  assert.equal(result[0].workflowStatus, 'EN_CONSULTATION');
  assert.equal(result[0].invoices[0].type, 'RADIOLOGY');
  const where = patientQuery?.where as Record<string, unknown>;
  assert.equal(where.clinicId, 'clinic-a');
  const include = patientQuery?.include as Record<string, unknown>;
  const invoices = include.invoices as { where: Record<string, unknown> };
  assert.equal(invoices.where.clinicId, 'clinic-a');
  assert.deepEqual(invoices.where.status, { in: ['PENDING', 'PARTIALLY_PAID'] });
  assert.deepEqual(invoices.where.balanceDue, { gt: 0 });
  assert.ok((invoices.where.type as { in: string[] }).in.includes('RADIOLOGY'));
});

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
    {} as PatientWorkflowService,
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
    {} as PatientWorkflowService,
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
  assert.deepEqual(createdNotifications, [{ id: 'notification-nurse-a', recipientId: 'nurse-a' }]);
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

test('patient updates reject manual workflow status changes', async () => {
  let transactionStarted = false;
  const service = new PatientsService(
    {
      patient: {
        findFirst: async () => ({ id: 'patient-a', clinicId: 'clinic-a', workflowStatus: 'HOSPITALISE' }),
      },
      $transaction: async () => {
        transactionStarted = true;
        throw new Error('Workflow status changes must be rejected before persistence.');
      },
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    {
      requireOperationalActor: async () => ({
        id: 'admin-a',
        clinicId: 'clinic-a',
        primaryRole: 'ADMIN',
      }),
    } as unknown as ClinicContextService,
    {} as PatientWorkflowService,
  );

  await assert.rejects(
    () => service.update('patient-a', { firstName: 'Updated', workflowStatus: 'EN_ATTENTE_MEDECIN' } as any, { userId: 'admin-a' }),
    /transitions métier/,
  );
  assert.equal(transactionStarted, false);
});
