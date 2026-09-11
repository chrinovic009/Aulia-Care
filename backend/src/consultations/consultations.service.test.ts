import assert from 'node:assert/strict';
import test from 'node:test';
import { ConsultationsService } from './consultations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PatientWorkflowService } from '../core/patient-workflow.service';

test('lab requests reject inactive tests selected by id', async () => {
  const queries: Array<Record<string, unknown>> = [];
  let labRequestCreated = false;
  let invoiceCreated = false;
  const service = new ConsultationsService(
    {
      $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
        labTest: {
          findUnique: async (query: Record<string, unknown>) => {
            queries.push(query);
            return null;
          },
        },
        labRequest: {
          create: async () => {
            labRequestCreated = true;
            return null;
          },
        },
        invoice: {
          create: async () => {
            invoiceCreated = true;
            return null;
          },
        },
      }),
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    {} as PatientWorkflowService,
  );

  (service as any).findOne = async () => ({
    providerId: 'physician-a',
    clinicId: 'clinic-a',
    patientId: 'patient-a',
    patient: { clinicId: 'clinic-a' },
  });
  (service as any).ensureWriteAccess = async () => undefined;

  await assert.rejects(
    () => service.createLabRequest('consultation-a', { labTestId: 'inactive-test' }, 'physician-a'),
    /examen du catalogue laboratoire est introuvable/,
  );

  assert.deepEqual(queries[0]?.where, { id: 'inactive-test', active: true });
  assert.equal(labRequestCreated, false);
  assert.equal(invoiceCreated, false);
});
