import assert from 'node:assert/strict';
import test from 'node:test';
import { ConsultationsService } from './consultations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PatientWorkflowService } from '../core/patient-workflow.service';

test('corporate coverage never charges a company outside the consultation clinic', async () => {
  const employeeQueries: Array<Record<string, unknown>> = [];
  let chargeCreated = false;
  let invoiceUpdated = false;
  const service = new ConsultationsService(
    {} as PrismaService,
    {} as NotificationsGateway,
    {} as PatientWorkflowService,
  );

  const handled = await (service as any).recordSubscriptionChargeForInvoice(
    {
      subscriptionEmployee: {
        findFirst: async (query: Record<string, unknown>) => {
          employeeQueries.push(query);
          return null;
        },
      },
      subscriptionCharge: {
        create: async () => {
          chargeCreated = true;
        },
      },
      invoice: {
        update: async () => {
          invoiceUpdated = true;
        },
      },
    },
    'patient-a',
    'clinic-a',
    'invoice-a',
    'Examen laboratoire',
    25000,
  );

  assert.equal(handled, false);
  assert.deepEqual(employeeQueries[0]?.where, {
    patientId: 'patient-a',
    deletedAt: null,
    status: 'ACTIVE',
    patient: { clinicId: 'clinic-a', deletedAt: null },
    company: { clinicId: 'clinic-a', status: 'ACTIVE', deletedAt: null },
  });
  assert.equal(chargeCreated, false);
  assert.equal(invoiceUpdated, false);
});

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
          findFirst: async (query: Record<string, unknown>) => {
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

  assert.deepEqual(queries[0]?.where, { id: 'inactive-test', clinicId: 'clinic-a', active: true });
  assert.equal(labRequestCreated, false);
  assert.equal(invoiceCreated, false);
});

test('finalizing a consultation refuses any ordered exam without a final result', async () => {
  const service = new ConsultationsService(
    {
      $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
        consultation: {
          update: async () => ({
            id: 'consultation-a',
            patientId: 'patient-a',
            appointmentId: 'appointment-a',
            version: 2,
            status: 'FINALIZED',
            chiefComplaint: 'Douleur',
            diagnosis: 'Diagnostic',
            assessment: '[]',
            plan: '[]',
          }),
        },
        labRequest: {
          findFirst: async () => ({
            items: [],
          }),
        },
        imagingRequest: {
          findFirst: async () => null,
        },
        appointment: { update: async () => undefined },
        patientVisit: { updateMany: async () => undefined },
        consultationNote: { create: async () => undefined },
        medicalHistory: { create: async () => undefined },
      }),
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    {} as PatientWorkflowService,
  );

  (service as any).findOne = async () => ({
    id: 'consultation-a',
    providerId: 'physician-a',
    clinicId: 'clinic-a',
    patientId: 'patient-a',
    patient: { id: 'patient-a', firstName: 'Jane', lastName: 'Doe', clinicId: 'clinic-a' },
    status: 'IN_PROGRESS',
    appointmentId: 'appointment-a',
  });
  (service as any).ensureWriteAccess = async () => undefined;

  await assert.rejects(
    () => service.saveClinicalSections(
      'consultation-a',
      {
        status: 'FINALIZED',
        attestation: true,
        consultationModule: {
          orderedExams: [{ category: 'LABORATORY', testName: 'Glycémie', catalogueItemId: 'lab-1', urgency: 'ROUTINE' }],
        },
      },
      'physician-a',
    ),
    /tous les examens complémentaires commandés n’ont pas de résultat final/,
  );
});
