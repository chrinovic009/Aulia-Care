import assert from 'node:assert/strict';
import test from 'node:test';
import { ConsultationsService } from './consultations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PatientWorkflowService } from '../core/patient-workflow.service';
import { CreatePrescriptionDto, RequestPrescriptionReplacementDto } from './dto/create-prescription.dto';
import { Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';

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

const noSafetyFindings = {
  allergy: { findMany: async () => [] },
  drugInteractionRule: { findMany: async () => [] },
  prescription: { findMany: async () => [] },
};

function prescribingService(options: { allergies: unknown[]; overrides?: Array<Record<string, unknown>>; onTransaction?: () => void }) {
  const service = new ConsultationsService({
    medication: { findMany: async () => [{ id: 'med-a', name: 'Médicament A', activeSubstance: 'substance alpha', atcCode: null, StockLot: [{ quantity: 10 }] }] },
    medicationSalePrice: { findMany: async () => [{ medicationId: 'med-a', amount: new Prisma.Decimal('5.00') }] },
    allergy: { findMany: async () => options.allergies },
    drugInteractionRule: { findMany: async () => [] },
    prescription: { findMany: async () => [] },
    user: { findMany: async () => [] },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      options.onTransaction?.();
      return callback({
        $executeRaw: async () => 1,
        consultation: { findUnique: async () => ({ status: "IN_PROGRESS" }) },
        allergy: { findMany: async () => options.allergies },
        drugInteractionRule: { findMany: async () => [] },
        prescription: { findMany: async () => [], create: async () => ({ id: 'prescription-a', version: 1 }) },
        prescriptionSafetyOverride: { createMany: async (input: { data: Array<Record<string, unknown>> }) => { options.overrides?.push(...input.data); } },
        invoice: { create: async (input: { data: Record<string, unknown> }) => ({ id: 'invoice-a', ...input.data }) },
        invoiceLine: { create: async () => undefined },
        subscriptionEmployee: { findFirst: async () => null },
        medicalHistory: { create: async () => undefined },
        notificationOutbox: { create: async () => undefined },
      });
    },
  } as unknown as PrismaService, {} as NotificationsGateway, { transition: async () => undefined } as unknown as PatientWorkflowService);
  Object.defineProperty(service, 'findOne', { value: async () => ({ providerId: 'doctor-a', clinicId: 'clinic-a', patientId: 'patient-a' }) });
  Object.defineProperty(service, 'ensureWriteAccess', { value: async () => undefined });
  return service;
}

test('a documented allergy blocks the prescription until it is justified in writing', async () => {
  let transactionStarted = false;
  const allergy = { id: 'allergy-a', substance: 'Substance Alpha', severity: 'SEVERE', reaction: 'oedème' };
  const blocked = prescribingService({ allergies: [allergy], onTransaction: () => { transactionStarted = true; } });
  await assert.rejects(
    blocked.createPrescription('consultation-a', { lines: [{ medicationId: 'med-a', quantity: 1 }], safetyOverrideReason: 'court' } as CreatePrescriptionDto, 'doctor-a'),
    (error: any) => error instanceof ConflictException && (error.getResponse() as any).code === 'PRESCRIPTION_SAFETY_ALERTS' && (error.getResponse() as any).alerts.length === 1,
  );
  assert.equal(transactionStarted, true);

  const overrides: Array<Record<string, unknown>> = [];
  const justified = prescribingService({ allergies: [allergy], overrides });
  await justified.createPrescription(
    'consultation-a',
    { lines: [{ medicationId: 'med-a', quantity: 1 }], safetyOverrideReason: 'Désensibilisation sous surveillance, avis allergologue.' } as CreatePrescriptionDto,
    'doctor-a',
  );
  assert.equal(overrides.length, 1);
  assert.equal(overrides[0].kind, 'ALLERGY');
  assert.equal(overrides[0].prescriberId, 'doctor-a');
  assert.match(String(overrides[0].reason), /allergologue/);
});

test('prescription snapshots clinic sale price rather than stock purchase cost', async () => {
  const invoiceRows: Array<Record<string, unknown>> = [];
  const lineRows: Array<Record<string, unknown>> = [];
  const outboxRows: Array<Record<string, unknown>> = [];
  const service = new ConsultationsService({
    medication: { findMany: async () => [{ id: 'med-a', name: 'Médicament A', StockLot: [{ quantity: 10, purchasePrice: new Prisma.Decimal('1.00') }] }] },
    medicationSalePrice: { findMany: async () => [{ medicationId: 'med-a', amount: new Prisma.Decimal('12.35') }] },
    ...noSafetyFindings,
    user: { findMany: async () => [] },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      $executeRaw: async () => 1,
      consultation: { findUnique: async () => ({ status: "IN_PROGRESS" }) },
      ...noSafetyFindings,
      prescription: { findMany: async () => [], create: async () => ({ id: 'prescription-a', version: 1 }) },
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
      patient: { findUnique: async () => ({ workflowStatus: 'EN_ATTENTE_DE_PAIEMENT' }) },
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
        $executeRaw: async () => 1,
        consultation: { findUnique: async () => ({ status: "IN_PROGRESS" }) },
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
        $executeRaw: async () => 1,
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
          findMany: async () => [{ items: [] }],
        },
        imagingRequest: {
          findMany: async () => [],
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
    /résultat final valide pour tous les examens/,
  );
});

function consultationServiceForUpdate(update: (args: { where: Record<string, unknown> }) => Promise<unknown>) {
  const service = new ConsultationsService({
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      consultation: { update },
      appointment: { update: async () => undefined },
    }),
  } as unknown as PrismaService, {} as NotificationsGateway, {} as PatientWorkflowService);
  Object.defineProperty(service, 'findOne', {
    value: async () => ({ id: 'consultation-a', providerId: 'doctor-a', status: 'IN_PROGRESS', version: 4, appointmentId: 'appointment-a' }),
  });
  Object.defineProperty(service, 'ensureWriteAccess', { value: async () => undefined });
  return service;
}

test('a consultation update checks version and finalisation in the same write as the update', async () => {
  let where: Record<string, unknown> | undefined;
  const service = consultationServiceForUpdate(async (args) => {
    where = args.where;
    return { id: 'consultation-a', status: 'IN_PROGRESS', version: 6 };
  });
  await service.update('consultation-a', { chiefComplaint: 'Toux', expectedVersion: 5 }, 'doctor-a');
  assert.deepEqual(where, { id: 'consultation-a', version: 5, status: { not: 'FINALIZED' } });

  await service.update('consultation-a', { chiefComplaint: 'Toux' }, 'doctor-a');
  assert.equal(where?.version, 4, 'without a client version, the version read in this request is enforced');
});

test('a concurrent consultation change is refused with 409 instead of being overwritten', async () => {
  const service = consultationServiceForUpdate(async () => {
    throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: 'test' });
  });
  await assert.rejects(
    service.update('consultation-a', { chiefComplaint: 'Toux', expectedVersion: 3 }, 'doctor-a'),
    (error: unknown) => error instanceof ConflictException && /modifiée entre-temps/.test(error.message),
  );
});

for (const status of ['FINALIZED', 'CANCELLED'] as const) {
 test(`generic update cannot set ${status}`, async () => {
  let writes=0; const service=consultationServiceForUpdate(async()=>{writes++;return {};});
  await assert.rejects(service.update('consultation-a',{status},'doctor-a'),/parcours/); assert.equal(writes,0);
 });
 test(`creation cannot start ${status}`, async()=>{
  const service=new ConsultationsService({} as PrismaService,{} as NotificationsGateway,{} as PatientWorkflowService);
  await assert.rejects(service.create({patientId:'p',appointmentId:'a',status},'doctor-a'),/parcours/);
 });
}
for(const method of ['createLabRequest','createImagingRequest','createPrescription'] as const){
 test(`${method} refuses new orders on a signed record`,async()=>{
  let writes=0;const service=new ConsultationsService({$transaction:async()=>{writes++;}} as unknown as PrismaService,{} as NotificationsGateway,{} as PatientWorkflowService);
  Object.defineProperty(service,'findOne',{value:async()=>({status:'FINALIZED',providerId:'doctor-a'})});
  Object.defineProperty(service,'ensureWriteAccess',{value:async()=>undefined});
  await assert.rejects((service[method] as any)('c',{},'doctor-a'),/finalisée/);assert.equal(writes,0);
 });
}

test('author archive predicates on the observed draft version and status',async()=>{
 let where:unknown;const service=new ConsultationsService({consultation:{findUnique:async()=>({id:'c',providerId:'doctor',status:'DRAFT',version:7})},$transaction:async(fn:any)=>fn({consultation:{update:async(q:any)=>{where=q.where;}},consultationNote:{create:async()=>{}}})} as unknown as PrismaService,{} as NotificationsGateway,{} as PatientWorkflowService);
 await service.archiveOwnDraft('c','doctor');assert.deepEqual(where,{id:'c',version:7,status:'DRAFT'});
});
test('author archive fails rather than overwriting a concurrently signed draft',async()=>{
 const service=new ConsultationsService({consultation:{findUnique:async()=>({id:'c',providerId:'doctor',status:'DRAFT',version:7})},$transaction:async(fn:any)=>fn({consultation:{update:async()=>{throw new Prisma.PrismaClientKnownRequestError('changed',{code:'P2025',clientVersion:'test'});}}})} as unknown as PrismaService,{} as NotificationsGateway,{} as PatientWorkflowService);
 await assert.rejects(service.archiveOwnDraft('c','doctor'),error=>error instanceof ConflictException);
});
test('administrative archive predicates on the observed encounter version and status',async()=>{
 let where:unknown;const service=new ConsultationsService({$transaction:async(fn:any)=>fn({consultation:{update:async(q:any)=>{where=q.where;}},consultationNote:{create:async()=>{}},patientVisit:{updateMany:async()=>{}}})} as unknown as PrismaService,{} as NotificationsGateway,{} as PatientWorkflowService);
 Object.defineProperty(service,'findOne',{value:async()=>({status:'IN_PROGRESS',version:5,appointmentId:'a'})});
 await service.remove('c','admin');assert.deepEqual(where,{id:'c',version:5,status:'IN_PROGRESS'});
});
