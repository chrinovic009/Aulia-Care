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
