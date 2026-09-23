import assert from 'node:assert/strict';
import test from 'node:test';
import { SubscriptionsService } from './subscriptions.service';
import { ClinicContextService } from '../core/clinic-context.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PrismaService } from '../prisma/prisma.service';

test('subscription companies are listed only inside the authenticated clinic', async () => {
  const queries: Array<Record<string, unknown>> = [];
  const prisma = {
    subscriptionCompany: {
      findMany: async (query: Record<string, unknown>) => {
        queries.push(query);
        return [];
      },
    },
  };
  const clinicContext = {
    requireOperationalActor: async () => ({ id: 'reception-a', clinicId: 'clinic-a', primaryRole: 'RECEPTIONIST' }),
  };
  const service = new SubscriptionsService(
    prisma as unknown as PrismaService,
    {} as NotificationsGateway,
    clinicContext as unknown as ClinicContextService,
  );

  await service.findCompanies('reception-a');

  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0]?.where, { clinicId: 'clinic-a', deletedAt: null });
});

test('subscription admission refuses a service from another clinic before any patient is created', async () => {
  const serviceQueries: Array<Record<string, unknown>> = [];
  let patientCreated = false;
  const prisma = {
    subscriptionEmployee: {
      findFirst: async () => ({
        id: 'subscription-employee-a',
        companyId: 'company-a',
        patientId: null,
        status: 'ACTIVE',
        firstName: 'Patient',
        lastName: 'Abonné',
        gender: 'F',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        company: { id: 'company-a', name: 'Entreprise A', status: 'ACTIVE' },
      }),
    },
    service: {
      findFirst: async (query: Record<string, unknown>) => {
        serviceQueries.push(query);
        if (serviceQueries.length === 1) {
          return { id: 'reception-fee-a', name: 'Consultation generale - Reception', tarifs: [{ prix: 10000 }] };
        }
        return null;
      },
    },
    $transaction: async () => {
      patientCreated = true;
      throw new Error('The transaction must not be reached for a cross-clinic service.');
    },
  };
  const clinicContext = {
    requireOperationalActor: async () => ({ id: 'reception-a', clinicId: 'clinic-a', primaryRole: 'RECEPTIONIST' }),
  };
  const service = new SubscriptionsService(
    prisma as unknown as PrismaService,
    {} as NotificationsGateway,
    clinicContext as unknown as ClinicContextService,
  );

  await assert.rejects(
    () => service.admitEmployee('subscription-employee-a', { serviceId: 'service-b' }, 'reception-a'),
    /introuvable dans cet établissement/,
  );

  assert.equal(patientCreated, false);
  assert.deepEqual(serviceQueries[1]?.where, {
    id: 'service-b',
    clinicId: 'clinic-a',
    active: true,
  });
});

test('subscription admission atomically creates a clinic-scoped patient and PatientVisit', async () => {
  let patientData: Record<string, unknown> | undefined;
  let visitData: Record<string, unknown> | undefined;
  const employee = {
    id: 'subscription-employee-a',
    companyId: 'company-a',
    patientId: null,
    status: 'ACTIVE',
    firstName: 'Patient',
    lastName: 'Abonné',
    gender: 'F',
    dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    company: { id: 'company-a', name: 'Entreprise A', status: 'ACTIVE' },
  };
  const transaction = {
    subscriptionEmployee: {
      findFirst: async () => employee,
      updateMany: async () => ({ count: 1 }),
    },
    patient: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        patientData = data;
        return { id: 'patient-a' };
      },
    },
    patientVisit: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        visitData = data;
        return { id: 'visit-a' };
      },
    },
    subscriptionCharge: { create: async () => ({ id: 'charge-a' }) },
    medicalHistory: { create: async () => ({ id: 'history-a' }) },
    auditTrail: { create: async () => ({ id: 'audit-a' }) },
  };
  const prisma = {
    subscriptionEmployee: { findFirst: async () => employee },
    service: {
      findFirst: async () => ({
        id: 'reception-fee-a',
        name: 'Consultation generale - Reception',
        tarifs: [{ prix: 10000 }],
      }),
    },
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  };
  const notifications = { notify: () => undefined };
  const clinicContext = {
    requireOperationalActor: async () => ({ id: 'reception-a', clinicId: 'clinic-a', primaryRole: 'RECEPTIONIST' }),
  };
  const service = new SubscriptionsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsGateway,
    clinicContext as unknown as ClinicContextService,
  );

  await service.admitEmployee('subscription-employee-a', {}, 'reception-a');

  assert.equal(patientData?.clinicId, 'clinic-a');
  assert.equal(patientData?.receptionistId, 'reception-a');
  assert.equal(visitData?.clinicId, 'clinic-a');
  assert.equal(visitData?.patientId, 'patient-a');
  assert.equal(visitData?.receptionistId, 'reception-a');
  assert.equal(visitData?.visitType, 'ABONNEMENT_ENTREPRISE');
});
