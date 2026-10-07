import assert from 'node:assert/strict';
import test from 'node:test';
import { ConsultationsService } from './consultations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PatientWorkflowService } from '../core/patient-workflow.service';
import { CreatePrescriptionDto, RequestPrescriptionReplacementDto } from './dto/create-prescription.dto';
import { Prisma } from '@prisma/client';

test('prescription rejects a missing clinic sale price without opening a transaction', async () => {
  let transactionStarted = false;
  const service = new ConsultationsService({
    medication: { findMany: async () => [{ id: 'med-a', name: 'Médicament A', StockLot: [{ quantity: 10, purchasePrice: new Prisma.Decimal('1.00') }] }] },
    medicationSalePrice: { findMany: async () => [] },
    $transaction: async () => { transactionStarted = true; },
  } as unknown as PrismaService, {} as NotificationsGateway, {} as PatientWorkflowService);
  Object.defineProperty(service, 'findOne', { value: async () => ({ providerId: 'doctor-a', clinicId: 'clinic-a', patientId: 'patient-a' }) });
  Object.defineProperty(service, 'ensureWriteAccess', { value: async () => undefined });

  await assert.rejects(
    service.createPrescription('consultation-a', { lines: [{ medicationId: 'med-a', quantity: 2 }] } as CreatePrescriptionDto, 'doctor-a'),
    /Aucun tarif de vente CDF/,
  );
  assert.equal(transactionStarted, false);
});

test('prescription snapshots clinic sale price rather than stock purchase cost', async () => {
  const invoiceRows: Array<Record<string, unknown>> = [];
  const lineRows: Array<Record<string, unknown>> = [];
  const outboxRows: Array<Record<string, unknown>> = [];
  const service = new ConsultationsService({
    medication: { findMany: async () => [{ id: 'med-a', name: 'Médicament A', StockLot: [{ quantity: 10, purchasePrice: new Prisma.Decimal('1.00') }] }] },
    medicationSalePrice: { findMany: async () => [{ medicationId: 'med-a', amount: new Prisma.Decimal('12.35') }] },
    user: { findMany: async () => [] },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      prescription: { create: async () => ({ id: 'prescription-a', version: 1 }) },
      invoice: { create: async (input: { data: Record<string, unknown> }) => {
        invoiceRows.push(input.data);
        return { id: 'invoice-a', ...input.data };
      } },
      invoiceLine: { create: async (input: { data: Record<string, unknown> }) => { lineRows.push(input.data); } },
      subscriptionEmployee: { findFirst: async () => null },
      medicalHistory: { create: async () => undefined },
      notificationOutbox: { create: async (input: { data: Record<string, unknown> }) => { outboxRows.push(input.data); } },
    }),
  } as unknown as PrismaService, {} as NotificationsGateway, {
    transition: async () => undefined,
  } as unknown as PatientWorkflowService);
  Object.defineProperty(service, 'findOne', { value: async () => ({ providerId: 'doctor-a', clinicId: 'clinic-a', patientId: 'patient-a' }) });
  Object.defineProperty(service, 'ensureWriteAccess', { value: async () => undefined });

  await service.createPrescription('consultation-a', { lines: [{ medicationId: 'med-a', quantity: 3 }] } as CreatePrescriptionDto, 'doctor-a');
  assert.equal(String(invoiceRows[0].totalAmount), '37.05');
  assert.equal(String(lineRows[0].unitPrice), '12.35');
  assert.equal(String(lineRows[0].totalAmount), '37.05');
  assert.equal(outboxRows[0].deduplicationKey, 'prescription-routing:prescription-a:v1');
});

test('a billed prescription cannot be rewritten behind an invoice or payment', async () => {
  let transactionStarted = false;
  const service = new ConsultationsService(
    {
      prescription: { findUnique: async () => ({
        id: 'prescription-a', consultationId: 'consultation-a', patientId: 'patient-a', clinicId: 'clinic-a',
        createdAt: new Date(), status: 'PRESCRIBED', pharmacyDispenses: [], lineItems: [],
      }) },
      invoice: { findFirst: async (query: Record<string, unknown>) => {
        assert.deepEqual(query.where, {
          clinicId: 'clinic-a', patientId: 'patient-a', type: 'PHARMACY',
          OR: [
            { prescriptionId: 'prescription-a' },
            { prescriptionId: null, remarks: 'Prescription:prescription-a' },
          ],
        });
        return { id: 'invoice-a' };
      } },
      $transaction: async () => { transactionStarted = true; },
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    {} as PatientWorkflowService,
  );
  Object.defineProperty(service, 'findOne', { value: async () => ({
    id: 'consultation-a', providerId: 'physician-a', clinicId: 'clinic-a', patientId: 'patient-a',
  }) });
  Object.defineProperty(service, 'ensureWriteAccess', { value: async () => undefined });

  await assert.rejects(
    service.updatePrescription('consultation-a', 'prescription-a', { lines: [] } as CreatePrescriptionDto, 'physician-a'),
    /déjà facturée/,
  );
  assert.equal(transactionStarted, false);
});

test('a billed prescription replacement is tenant-scoped and records a reasoned finance request', async () => {
  const replacementRows: Array<Record<string, unknown>> = [];
  const service = new ConsultationsService(
    {
      prescription: {
        findFirst: async (query: { where: Record<string, unknown> }) => {
          assert.equal(query.where.clinicId, 'clinic-a');
          assert.equal(query.where.patientId, 'patient-a');
          return {
            id: 'prescription-a',
            billingInvoices: [{
              id: 'invoice-a', status: 'PENDING', payments: [], subscriptionCharges: [],
            }],
            pharmacyDispenses: [],
          };
        },
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        prescriptionReplacement: {
          findFirst: async () => null,
          create: async (input: { data: Record<string, unknown> }) => {
            replacementRows.push(input.data);
            return { id: 'replacement-a', ...input.data };
          },
        },
        medicalHistory: { create: async () => undefined },
      }),
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    {} as PatientWorkflowService,
  );
  Object.defineProperty(service, 'findOne', { value: async () => ({ providerId: 'physician-a', clinicId: 'clinic-a', patientId: 'patient-a' }) });
  Object.defineProperty(service, 'ensureWriteAccess', { value: async () => undefined });

  await service.requestPrescriptionReplacement('consultation-a', 'prescription-a', {
    reason: 'Réaction indésirable documentée',
    lines: [{ medicationId: 'med-a', quantity: 1 }],
  } as RequestPrescriptionReplacementDto, 'physician-a');

  assert.equal(replacementRows[0].clinicId, 'clinic-a');
  assert.equal(replacementRows[0].originalInvoiceId, 'invoice-a');
  assert.equal(replacementRows[0].requestedById, 'physician-a');
  assert.equal(replacementRows[0].financialHandling, 'CANCEL_UNPAID');
});

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

test('corporate charge keeps the clinical invoice reference and does not duplicate an invoice charge', async () => {
  const charges: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  let alreadyCharged = false;
  const service = new ConsultationsService(
    {} as PrismaService, {} as NotificationsGateway, {} as PatientWorkflowService,
  );
  const tx = {
    $executeRaw: async () => 1,
    subscriptionEmployee: { findFirst: async () => ({ id: 'employee-a', companyId: 'company-a', company: { name: 'Company A', coversAllServices: true, creditLimit: null } }) },
    subscriptionCharge: {
      findFirst: async () => alreadyCharged ? { id: 'charge-a' } : null,
      create: async (input: { data: Record<string, unknown> }) => { charges.push(input.data); alreadyCharged = true; },
    },
    invoice: { update: async (input: { data: Record<string, unknown> }) => { updates.push(input.data); } },
  };
  const charge = (service as any).recordSubscriptionChargeForInvoice.bind(service);
  assert.equal(await charge(tx, 'patient-a', 'clinic-a', 'invoice-a', 'Imagerie', 100, null), true);
  assert.equal(await charge(tx, 'patient-a', 'clinic-a', 'invoice-a', 'Imagerie', 100, null), true);
  assert.equal(charges.length, 1);
  assert.equal(charges[0].serviceId, null);
  assert.equal(charges[0].sourceInvoiceId, 'invoice-a');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, 'COVERED');
  assert.equal(Object.hasOwn(updates[0], 'remarks'), false);
});

test('an active corporate employee without explicit global coverage remains on the personal payment circuit', async () => {
  let written = false;
  const service = new ConsultationsService({} as PrismaService, {} as NotificationsGateway, {} as PatientWorkflowService);
  const covered = await (service as any).recordSubscriptionChargeForInvoice({
    subscriptionEmployee: { findFirst: async () => ({ company: { coversAllServices: false } }) },
    subscriptionCharge: { create: async () => { written = true; } },
  }, 'patient-a', 'clinic-a', 'invoice-a', 'Examen', 100);
  assert.equal(covered, false);
  assert.equal(written, false);
});

test('credit limit includes pending charges and monthly balances before authorizing coverage', async () => {
  let written = false;
  const service = new ConsultationsService({} as PrismaService, {} as NotificationsGateway, {} as PatientWorkflowService);
  const covered = await (service as any).recordSubscriptionChargeForInvoice({
    $executeRaw: async () => 1,
    subscriptionEmployee: { findFirst: async () => ({ companyId: 'company-a', company: { coversAllServices: true, creditLimit: new Prisma.Decimal('100.00') } }) },
    subscriptionCharge: {
      findFirst: async () => null,
      aggregate: async () => ({ _sum: { amount: new Prisma.Decimal('20.00') } }),
      create: async () => { written = true; },
    },
    invoice: { aggregate: async () => ({ _sum: { balanceDue: new Prisma.Decimal('60.00') } }) },
  }, 'patient-a', 'clinic-a', 'invoice-a', 'Examen', new Prisma.Decimal('25.00'));
  assert.equal(covered, false);
  assert.equal(written, false);
});

test('a covered exam notifies its clinic service and reception even beside an unpaid exam', async () => {
  const sent: Array<{ userId: string; event: string }> = [];
  const service = new ConsultationsService(
    {
      user: { findMany: async (query: { where: { OR: unknown[]; clinicId: string } }) => {
        assert.equal(query.where.clinicId, 'clinic-a');
        return query.where.OR.some((item) => JSON.stringify(item).includes('RECEPTIONIST'))
          ? [{ id: 'reception-a' }]
          : query.where.OR.some((item) => JSON.stringify(item).includes('CASHIER'))
            ? [{ id: 'cashier-a' }]
            : [{ id: 'laboratory-a' }];
      } },
      notification: { create: async (input: { data: { recipientId: string } }) => input.data },
    } as unknown as PrismaService,
    {
      notifyToUser: (userId: string, event: string) => { sent.push({ userId, event }); },
      notify: () => undefined,
    } as unknown as NotificationsGateway,
    {} as PatientWorkflowService,
  );

  await (service as any).notifyMaterializedExamInvoices('clinic-a', 'patient-a', 'A', 'Patient', [
    { invoiceId: 'covered-a', invoiceStatus: 'COVERED', invoiceTotal: 100, kind: 'LABORATORY', label: 'Test', priority: 'NORMAL' },
    { invoiceId: 'unpaid-a', invoiceStatus: 'PENDING', invoiceTotal: 200, kind: 'IMAGING', label: 'Image', priority: 'NORMAL' },
  ]);

  assert.ok(sent.some((entry) => entry.userId === 'laboratory-a' && entry.event === 'lab.request.created'));
  assert.ok(sent.some((entry) => entry.userId === 'reception-a' && entry.event === 'notification.created'));
  assert.ok(sent.some((entry) => entry.userId === 'cashier-a' && entry.event === 'notification.created'));
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
