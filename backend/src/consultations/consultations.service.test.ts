import assert from 'node:assert/strict';
import test from 'node:test';
import { ConsultationsService } from './consultations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PatientWorkflowService } from '../core/patient-workflow.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';

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
    subscriptionEmployee: { findFirst: async () => ({ id: 'employee-a', companyId: 'company-a', company: { name: 'Company A' } }) },
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
  assert.equal(updates.length, 1);
  assert.equal(Object.hasOwn(updates[0], 'remarks'), false);
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
    { invoiceId: 'covered-a', invoiceStatus: 'PAID', invoiceTotal: 100, kind: 'LABORATORY', label: 'Test', priority: 'NORMAL' },
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
