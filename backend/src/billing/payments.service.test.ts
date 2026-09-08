import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

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
  );

  await assert.rejects(
    () => service.createPayment({ invoiceId: 'invoice-a', amount: 1000, method: 'CASH' }, 'cashier-b'),
    /autre/,
  );
  assert.equal(transactionStarted, false);
});
