import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PatientWorkflowService } from '../core/patient-workflow.service';

test('payment refuses a legacy invoice without a clinic before opening a transaction', async () => {
  let transactionStarted = false;
  const service = new PaymentsService(
    {
      invoice: {
        findUnique: async () => ({
          id: 'invoice-legacy',
          clinicId: null,
          patientId: 'patient-a',
          patient: { clinicId: 'clinic-a' },
        }),
      },
      $transaction: async () => {
        transactionStarted = true;
        throw new Error('A clinic-less invoice must be rejected before a transaction starts.');
      },
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    {} as PatientWorkflowService,
  );

  await assert.rejects(
    () => service.createPayment({ invoiceId: 'invoice-legacy', amount: 1000, method: 'CASH' }),
    /rattach/,
  );
  assert.equal(transactionStarted, false);
});

test('payment refuses a cashier from another clinic before opening a transaction', async () => {
  let transactionStarted = false;
  const service = new PaymentsService(
    {
      invoice: {
        findUnique: async () => ({
          id: 'invoice-a',
          clinicId: 'clinic-a',
          patientId: 'patient-a',
          patient: { clinicId: 'clinic-a' },
        }),
      },
      user: {
        findUnique: async () => ({ clinicId: 'clinic-b', primaryRole: 'CASHIER' }),
      },
      $transaction: async () => {
        transactionStarted = true;
        throw new Error('A cross-clinic payment must be rejected before a transaction starts.');
      },
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    {} as PatientWorkflowService,
  );

  await assert.rejects(
    () => service.createPayment({ invoiceId: 'invoice-a', amount: 1000, method: 'CASH' }, 'cashier-b'),
    /autre/,
  );
  assert.equal(transactionStarted, false);
});

test('payment never creates a hospitalization directly when the patient is marked for admission', async () => {
  const hospitalizationCreates: unknown[] = [];
  const patientWorkflow = {
    transition: async () => ({}) as any,
  };

  const service = new PaymentsService(
    {
      invoice: {
        findUnique: async () => ({
          id: 'invoice-hosp',
          clinicId: 'clinic-a',
          patientId: 'patient-a',
          status: 'PARTIALLY_PAID',
          balanceDue: 500,
          type: 'SERVICE',
          patient: { clinicId: 'clinic-a', admissionType: 'hospitalisation', service: { name: 'Médecine interne' } },
          remarks: null,
        }),
      },
      $transaction: async (callback: any) => callback({
        $executeRaw: async () => undefined,
        invoice: {
          findUnique: async () => ({
            id: 'invoice-hosp',
            clinicId: 'clinic-a',
            patientId: 'patient-a',
            status: 'PARTIALLY_PAID',
            balanceDue: 500,
            type: 'SERVICE',
            patient: { clinicId: 'clinic-a', admissionType: 'hospitalisation', service: { name: 'Médecine interne' } },
            remarks: null,
          }),
          update: async () => ({ id: 'invoice-hosp', status: 'PAID', balanceDue: 0 }),
        },
        payment: { create: async () => ({ id: 'payment-1' }) },
        accountingJournalEntry: { findFirst: async () => null, create: async () => undefined },
        patientVisit: { updateMany: async () => ({ count: 1 }) },
        patient: { findFirstOrThrow: async () => ({ id: 'patient-a', clinicId: 'clinic-a', receptionistId: null, firstName: 'Alice', lastName: 'Bouchard', createdAt: new Date() }) },
        user: {
          findUnique: async () => ({ id: 'user-1', clinicId: 'clinic-a', primaryRole: 'PATIENT' }),
          findMany: async () => [],
        },
        chatMessage: { create: async () => ({ id: 'message-1', recipientId: 'reception-1', sender: { displayName: 'Patient', username: 'patient' }, createdAt: new Date() }) },
        notification: { create: async () => ({ id: 'notif-1' }) },
        labRequest: { findFirst: async () => null, update: async () => ({ id: 'lab-1' }) },
        prescription: { findFirst: async () => null, update: async () => ({ id: 'rx-1' }) },
        auditLog: { create: async () => undefined },
        hospitalization: { create: async (input: unknown) => { hospitalizationCreates.push(input); return { id: 'hospitalization-1' }; } },
      }) as any,
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    patientWorkflow as any,
  );

  await service.createPayment({ invoiceId: 'invoice-hosp', amount: 500, method: 'CASH' });
  assert.deepEqual(hospitalizationCreates, []);
});
