import {
  AuliaLayer,
  ClinicProvisioningStatus,
  DepartmentType,
  ImagingModality,
  ImagingRequestStatus,
  InvoiceStatus,
  InvoiceType,
  LabRequestItemStatus,
  LabRequestStatus,
  LabResultType,
  LabResultValidationStatus,
  MedicationFrequency,
  MedicationRoute,
  PaymentMethod,
  PatientWorkflowStatus,
  Prisma,
  PrismaClient,
  PrescriptionStatus,
  RoleSlug,
  ServiceCategory,
  VitalType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  assertDemoDatabaseIdentity,
  assertDemoSentinel,
  DEMO_SOURCE_NODE,
  requireDemoConfirmation,
} from '../src/scripts/demo-seed-safety';

const prisma = new PrismaClient();

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const roleIds: Record<RoleSlug, string> = {
  SUPER_ADMIN: '21111111-1111-4111-8111-111111111111',
  ADMIN: '21111111-1111-4111-8111-111111111112',
  RECEPTIONIST: '21111111-1111-4111-8111-111111111113',
  NURSE: '21111111-1111-4111-8111-111111111114',
  PHYSICIAN: '21111111-1111-4111-8111-111111111115',
  LAB_MANAGER: '21111111-1111-4111-8111-111111111116',
  RADIOLOGIST: '21111111-1111-4111-8111-111111111117',
  PHARMACIST: '21111111-1111-4111-8111-111111111118',
  CASHIER: '21111111-1111-4111-8111-111111111119',
  FINANCE: '21111111-1111-4111-8111-111111111120',
  DEV: '21111111-1111-4111-8111-111111111121',
  LAB_TECHNICIAN: '21111111-1111-4111-8111-111111111122',
  SURGEON: '21111111-1111-4111-8111-111111111123',
  ANESTHESIOLOGIST: '21111111-1111-4111-8111-111111111124',
  PATIENT: '21111111-1111-4111-8111-111111111125',
};

const demoRoles = [
  RoleSlug.SUPER_ADMIN,
  RoleSlug.ADMIN,
  RoleSlug.FINANCE,
  RoleSlug.CASHIER,
  RoleSlug.RECEPTIONIST,
  RoleSlug.NURSE,
  RoleSlug.PHYSICIAN,
  RoleSlug.LAB_MANAGER,
  RoleSlug.RADIOLOGIST,
  RoleSlug.PHARMACIST,
] as const;

const accounts = [
  { id: '22222222-2222-4222-8222-000000000001', employeeId: '33333333-3333-4333-8333-000000000001', role: RoleSlug.SUPER_ADMIN, username: 'demo.superadmin', firstName: 'Amina', lastName: 'Kabasele', label: 'Super administratrice' },
  { id: '22222222-2222-4222-8222-000000000002', employeeId: '33333333-3333-4333-8333-000000000002', role: RoleSlug.ADMIN, username: 'demo.admin', firstName: 'Benoît', lastName: 'Mulumba', label: 'Administrateur' },
  { id: '22222222-2222-4222-8222-000000000003', employeeId: '33333333-3333-4333-8333-000000000003', role: RoleSlug.FINANCE, username: 'demo.finance', firstName: 'Chantal', lastName: 'Kanku', label: 'Finance' },
  { id: '22222222-2222-4222-8222-000000000004', employeeId: '33333333-3333-4333-8333-000000000004', role: RoleSlug.CASHIER, username: 'demo.caisse', firstName: 'David', lastName: 'Mwamba', label: 'Caissier' },
  { id: '22222222-2222-4222-8222-000000000005', employeeId: '33333333-3333-4333-8333-000000000005', role: RoleSlug.RECEPTIONIST, username: 'demo.reception', firstName: 'Esther', lastName: 'Kabeya', label: 'Réceptionniste' },
  { id: '22222222-2222-4222-8222-000000000006', employeeId: '33333333-3333-4333-8333-000000000006', role: RoleSlug.NURSE, username: 'demo.infirmier', firstName: 'Fabrice', lastName: 'Ilunga', label: 'Infirmier' },
  { id: '22222222-2222-4222-8222-000000000007', employeeId: '33333333-3333-4333-8333-000000000007', role: RoleSlug.PHYSICIAN, username: 'demo.medecin', firstName: 'Grace', lastName: 'Tshibanda', label: 'Médecin', specialty: 'Médecine générale' },
  { id: '22222222-2222-4222-8222-000000000008', employeeId: '33333333-3333-4333-8333-000000000008', role: RoleSlug.LAB_MANAGER, username: 'demo.labo', firstName: 'Hervé', lastName: 'Mbuyi', label: 'Responsable laboratoire' },
  { id: '22222222-2222-4222-8222-000000000009', employeeId: '33333333-3333-4333-8333-000000000009', role: RoleSlug.RADIOLOGIST, username: 'demo.radio', firstName: 'Inès', lastName: 'Kalala', label: 'Radiologue', specialty: 'Radiologie' },
  { id: '22222222-2222-4222-8222-000000000010', employeeId: '33333333-3333-4333-8333-000000000010', role: RoleSlug.PHARMACIST, username: 'demo.pharmacie', firstName: 'Jean', lastName: 'Lukusa', label: 'Pharmacien' },
] as const;

const departmentData = [
  { id: '31111111-1111-4111-8111-111111111111', name: 'Accueil DEMO', code: 'DEMO-REC', type: DepartmentType.RECEPTION },
  { id: '31111111-1111-4111-8111-111111111112', name: 'Soins DEMO', code: 'DEMO-MED', type: DepartmentType.MEDICAL },
  { id: '31111111-1111-4111-8111-111111111113', name: 'Laboratoire DEMO', code: 'DEMO-LAB', type: DepartmentType.LABORATORY },
  { id: '31111111-1111-4111-8111-111111111114', name: 'Imagerie DEMO', code: 'DEMO-RAD', type: DepartmentType.RADIOLOGY },
  { id: '31111111-1111-4111-8111-111111111115', name: 'Pharmacie DEMO', code: 'DEMO-PHA', type: DepartmentType.PHARMACY },
] as const;

const serviceData = [
  { id: '41111111-1111-4111-8111-111111111111', name: 'Consultation générale DEMO', category: ServiceCategory.CONSULTATION, isParamedical: false },
  { id: '41111111-1111-4111-8111-111111111112', name: 'Laboratoire DEMO', category: ServiceCategory.LABORATORY, isParamedical: true },
  { id: '41111111-1111-4111-8111-111111111113', name: 'Imagerie DEMO', category: ServiceCategory.IMAGING, isParamedical: true },
  { id: '41111111-1111-4111-8111-111111111114', name: 'Pharmacie DEMO', category: ServiceCategory.PHARMACY, isParamedical: true },
] as const;

const patientData = [
  { id: '51111111-1111-4111-8111-111111111111', firstName: 'Patient', lastName: 'Fictif Alpha', gender: 'Femme', externalId: 'DEMO-P-001' },
  { id: '51111111-1111-4111-8111-111111111112', firstName: 'Patient', lastName: 'Fictif Bravo', gender: 'Homme', externalId: 'DEMO-P-002' },
  { id: '51111111-1111-4111-8111-111111111113', firstName: 'Patient', lastName: 'Fictif Charlie', gender: 'Femme', externalId: 'DEMO-P-003' },
  { id: '51111111-1111-4111-8111-111111111114', firstName: 'Patient', lastName: 'Fictif Delta', gender: 'Homme', externalId: 'DEMO-P-004' },
  { id: '51111111-1111-4111-8111-111111111115', firstName: 'Patient', lastName: 'Fictif Echo', gender: 'Femme', externalId: 'DEMO-P-005' },
  { id: '51111111-1111-4111-8111-111111111116', firstName: 'Patient', lastName: 'Fictif Foxtrot', gender: 'Homme', externalId: 'DEMO-P-006' },
  { id: '51111111-1111-4111-8111-111111111117', firstName: 'Patient', lastName: 'Fictif Gamma', gender: 'Femme', externalId: 'DEMO-P-007' },
] as const;

// All identifiers below are deterministic and intentionally reserved for the
// public fictitious dataset.  Keeping the fixtures explicit makes a second
// seed idempotent and lets the guard reject an already populated database.
const serviceUnitData = [
  { id: '61111111-1111-4111-8111-111111111111', name: 'Consultations DEMO', departmentId: departmentData[1].id, category: ServiceCategory.CONSULTATION },
  { id: '61111111-1111-4111-8111-111111111112', name: 'Laboratoire DEMO', departmentId: departmentData[2].id, category: ServiceCategory.LABORATORY },
  { id: '61111111-1111-4111-8111-111111111113', name: 'Radiologie DEMO', departmentId: departmentData[3].id, category: ServiceCategory.IMAGING },
  { id: '61111111-1111-4111-8111-111111111114', name: 'Pharmacie DEMO', departmentId: departmentData[4].id, category: ServiceCategory.PHARMACY },
] as const;

const fixtureIds = {
  labSection: '71111111-1111-4111-8111-111111111111',
  labCategory: '71111111-1111-4111-8111-111111111112',
  labTest: '71111111-1111-4111-8111-111111111113',
  imagingCatalogue: '71111111-1111-4111-8111-111111111114',
  imagingMachine: '71111111-1111-4111-8111-111111111115',
  medicationSection: '71111111-1111-4111-8111-111111111116',
  medicationCategory: '71111111-1111-4111-8111-111111111117',
  medication: '71111111-1111-4111-8111-111111111118',
  stockLot: '71111111-1111-4111-8111-111111111119',
  salePrice: '71111111-1111-4111-8111-111111111120',
} as const;

const appointments = patientData.map((patient, index) => ({
  id: `81111111-1111-4111-8111-11111111111${index + 1}`,
  patientId: patient.id,
  scheduledAt: new Date(`2026-10-0${index + 1}T08:00:00.000Z`),
}));

const consultations = patientData.map((patient, index) => ({
  id: `82111111-1111-4111-8111-11111111111${index + 1}`,
  patientId: patient.id,
  appointmentId: appointments[index].id,
}));

const invoices = [
  { id: '83111111-1111-4111-8111-111111111111', patientId: patientData[2].id, type: InvoiceType.SERVICE, status: InvoiceStatus.PENDING, total: '25000.00', balance: '25000.00', label: 'Consultation en attente de paiement' },
  { id: '83111111-1111-4111-8111-111111111112', patientId: patientData[3].id, type: InvoiceType.LABORATORY, status: InvoiceStatus.PAID, total: '18000.00', balance: '0.00', label: 'Examen de laboratoire réglé' },
  { id: '83111111-1111-4111-8111-111111111113', patientId: patientData[5].id, type: InvoiceType.RADIOLOGY, status: InvoiceStatus.PARTIALLY_PAID, total: '50000.00', balance: '20000.00', label: 'Imagerie – paiement partiel' },
  { id: '83111111-1111-4111-8111-111111111114', patientId: patientData[6].id, type: InvoiceType.PHARMACY, status: InvoiceStatus.PAID, total: '12000.00', balance: '0.00', label: 'Ordonnance réglée' },
] as const;

const payments = [
  { id: '84111111-1111-4111-8111-111111111111', invoiceId: invoices[1].id, amount: '18000.00', reference: 'DEMO-LAB-PAID' },
  { id: '84111111-1111-4111-8111-111111111112', invoiceId: invoices[2].id, amount: '30000.00', reference: 'DEMO-RAD-PARTIAL' },
  { id: '84111111-1111-4111-8111-111111111113', invoiceId: invoices[3].id, amount: '12000.00', reference: 'DEMO-PHARM-PAID' },
] as const;

const departmentIdByRole: Partial<Record<RoleSlug, string>> = {
  [RoleSlug.RECEPTIONIST]: departmentData[0].id,
  [RoleSlug.NURSE]: departmentData[1].id,
  [RoleSlug.PHYSICIAN]: departmentData[1].id,
  [RoleSlug.LAB_MANAGER]: departmentData[2].id,
  [RoleSlug.RADIOLOGIST]: departmentData[3].id,
  [RoleSlug.PHARMACIST]: departmentData[4].id,
};

const attendanceRoles = new Set<RoleSlug>([
  RoleSlug.FINANCE,
  RoleSlug.CASHIER,
  RoleSlug.RECEPTIONIST,
  RoleSlug.NURSE,
  RoleSlug.PHYSICIAN,
  RoleSlug.LAB_MANAGER,
  RoleSlug.RADIOLOGIST,
  RoleSlug.PHARMACIST,
]);

/** The public baseline intentionally contains accounts and patients only.
 * Rich clinical fixtures are opt-in so a routine DEMO recovery never creates
 * invoices, prescriptions, results, or stock movements by surprise. */
function resolveDemoSeedProfile(): 'BASE' | 'FULL' {
  const profile = String(process.env.AULIA_DEMO_SEED_PROFILE || 'BASE')
    .trim()
    .toUpperCase();
  if (profile !== 'BASE' && profile !== 'FULL') {
    throw new Error('AULIA_DEMO_SEED_PROFILE doit être BASE ou FULL.');
  }
  return profile;
}

async function assertNoForeignData(tx: Prisma.TransactionClient) {
  const [
    clinic, user, employee, patient, department, service, role, serviceUnit,
    appointment, consultation, visit, vital, invoice, payment, invoiceLine,
    labSection, labCategory, labTest, labRequest, labItem, labResult,
    imagingCatalogue, imagingMachine, imagingRequest, imagingReport,
    medicationSection, medicationCategory, medication, stockLot, salePrice,
    prescription, prescriptionLine, hospitalization,
  ] = await Promise.all([
    tx.clinic.findFirst({ where: { id: { not: CLINIC_ID } }, select: { id: true } }),
    tx.user.findFirst({ where: { id: { notIn: accounts.map((account) => account.id) } }, select: { id: true } }),
    tx.employee.findFirst({ where: { id: { notIn: accounts.map((account) => account.employeeId) } }, select: { id: true } }),
    tx.patient.findFirst({ where: { id: { notIn: patientData.map((patient) => patient.id) } }, select: { id: true } }),
    tx.department.findFirst({ where: { id: { notIn: departmentData.map((department) => department.id) } }, select: { id: true } }),
    tx.service.findFirst({ where: { id: { notIn: serviceData.map((service) => service.id) } }, select: { id: true } }),
    tx.role.findFirst({ where: { id: { notIn: demoRoles.map((role) => roleIds[role]) } }, select: { id: true } }),
    tx.serviceUnit.findFirst({ where: { id: { notIn: serviceUnitData.map((unit) => unit.id) } }, select: { id: true } }),
    tx.appointment.findFirst({ where: { id: { notIn: appointments.map((record) => record.id) } }, select: { id: true } }),
    tx.consultation.findFirst({ where: { id: { notIn: consultations.map((record) => record.id) } }, select: { id: true } }),
    tx.patientVisit.findFirst({ where: { id: { notIn: appointments.map((_, index) => `85111111-1111-4111-8111-11111111111${index + 1}`) } }, select: { id: true } }),
    tx.vitalSign.findFirst({ where: { id: { notIn: ['86111111-1111-4111-8111-111111111111', '86111111-1111-4111-8111-111111111112', '86111111-1111-4111-8111-111111111113', '86111111-1111-4111-8111-111111111114', '86111111-1111-4111-8111-111111111115', '86111111-1111-4111-8111-111111111116', '86111111-1111-4111-8111-111111111117', '86111111-1111-4111-8111-111111111118'] } }, select: { id: true } }),
    tx.invoice.findFirst({ where: { id: { notIn: invoices.map((record) => record.id) } }, select: { id: true } }),
    tx.payment.findFirst({ where: { id: { notIn: payments.map((record) => record.id) } }, select: { id: true } }),
    tx.invoiceLine.findFirst({ where: { id: { notIn: invoices.map((record) => `${record.id.slice(0, -1)}9`) } }, select: { id: true } }),
    tx.labSection.findFirst({ where: { id: { not: fixtureIds.labSection } }, select: { id: true } }),
    tx.labCategory.findFirst({ where: { id: { not: fixtureIds.labCategory } }, select: { id: true } }),
    tx.labTest.findFirst({ where: { id: { not: fixtureIds.labTest } }, select: { id: true } }),
    tx.labRequest.findFirst({ where: { id: { notIn: ['87111111-1111-4111-8111-111111111111', '87111111-1111-4111-8111-111111111112'] } }, select: { id: true } }),
    tx.labRequestItem.findFirst({ where: { id: { notIn: ['87211111-1111-4111-8111-111111111111', '87211111-1111-4111-8111-111111111112'] } }, select: { id: true } }),
    tx.labResult.findFirst({ where: { id: { not: '87311111-1111-4111-8111-111111111111' } }, select: { id: true } }),
    tx.imagingCatalogue.findFirst({ where: { id: { not: fixtureIds.imagingCatalogue } }, select: { id: true } }),
    tx.imagingMachine.findFirst({ where: { id: { not: fixtureIds.imagingMachine } }, select: { id: true } }),
    tx.imagingRequest.findFirst({ where: { id: { notIn: ['88111111-1111-4111-8111-111111111111', '88111111-1111-4111-8111-111111111112'] } }, select: { id: true } }),
    tx.imagingReport.findFirst({ where: { imagingRequestId: { not: '88111111-1111-4111-8111-111111111112' } }, select: { id: true } }),
    tx.medicationSection.findFirst({ where: { id: { not: fixtureIds.medicationSection } }, select: { id: true } }),
    tx.medicationCategory.findFirst({ where: { id: { not: fixtureIds.medicationCategory } }, select: { id: true } }),
    tx.medication.findFirst({ where: { id: { not: fixtureIds.medication } }, select: { id: true } }),
    tx.stockLot.findFirst({ where: { id: { not: fixtureIds.stockLot } }, select: { id: true } }),
    tx.medicationSalePrice.findFirst({ where: { id: { not: fixtureIds.salePrice } }, select: { id: true } }),
    tx.prescription.findFirst({ where: { id: { not: '89111111-1111-4111-8111-111111111111' } }, select: { id: true } }),
    tx.prescriptionLine.findFirst({ where: { id: { not: '89211111-1111-4111-8111-111111111111' } }, select: { id: true } }),
    tx.hospitalization.findFirst({ where: { id: { not: '8a111111-1111-4111-8111-111111111111' } }, select: { id: true } }),
  ]);

  if ([clinic, user, employee, patient, department, service, role, serviceUnit,
    appointment, consultation, visit, vital, invoice, payment, invoiceLine,
    labSection, labCategory, labTest, labRequest, labItem, labResult,
    imagingCatalogue, imagingMachine, imagingRequest, imagingReport,
    medicationSection, medicationCategory, medication, stockLot, salePrice,
    prescription, prescriptionLine, hospitalization].some(Boolean)) {
    throw new Error('Refus : des enregistrements étrangers à la démonstration sont présents dans cette base.');
  }
}

async function main() {
  requireDemoConfirmation('SEED_PUBLIC_CORE_DEMO');
  const profile = resolveDemoSeedProfile();
  const password = String(process.env.AULIA_DEMO_PASSWORD || '');
  if (password.length < 16) {
    throw new Error('AULIA_DEMO_PASSWORD doit contenir au moins 16 caractères.');
  }

  const databaseName = await assertDemoDatabaseIdentity(prisma);
  await assertDemoSentinel(prisma, databaseName);
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    await assertNoForeignData(tx);

    for (const role of demoRoles) {
      await tx.role.upsert({
        where: { id: roleIds[role] },
        update: { name: `DEMO ${role}`, description: 'Rôle réservé à la démonstration publique.' },
        create: { id: roleIds[role], slug: role, name: `DEMO ${role}`, description: 'Rôle réservé à la démonstration publique.', sourceNode: DEMO_SOURCE_NODE },
      });
    }

    await tx.clinic.upsert({
      where: { id: CLINIC_ID },
      update: { name: 'Aulia Care — Démonstration', brandDisplayName: 'Aulia Care DEMO', status: 'ACTIVE', provisioningStatus: ClinicProvisioningStatus.ACTIVE },
      create: {
        id: CLINIC_ID,
        name: 'Aulia Care — Démonstration',
        brandDisplayName: 'Aulia Care DEMO',
        legalName: 'Aulia Care — Données fictives',
        city: 'Démonstration',
        country: 'CD',
        status: 'ACTIVE',
        provisioningStatus: ClinicProvisioningStatus.ACTIVE,
      },
    });

    for (const account of accounts) {
      await tx.user.upsert({
        where: { id: account.id },
        update: { passwordHash, status: 'ACTIVE', clinicId: CLINIC_ID, primaryRole: account.role },
        create: {
          id: account.id,
          email: `${account.username}@example.test`,
          username: account.username,
          displayName: `${account.label} DEMO`,
          firstName: account.firstName,
          lastName: account.lastName,
          passwordHash,
          primaryRole: account.role,
          clinicId: CLINIC_ID,
          specialty: 'specialty' in account ? account.specialty : null,
          sourceNode: DEMO_SOURCE_NODE,
        },
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: account.id, roleId: roleIds[account.role] } },
        update: { active: true },
        create: { userId: account.id, roleId: roleIds[account.role], active: true, sourceNode: DEMO_SOURCE_NODE },
      });
    }

    await tx.platformLayerConfiguration.upsert({
      where: { clinicId: CLINIC_ID },
      update: { enabledLayers: [AuliaLayer.CORE], updatedById: accounts[0].id },
      create: { clinicId: CLINIC_ID, enabledLayers: [AuliaLayer.CORE], configuredAt: new Date(), updatedById: accounts[0].id },
    });

    for (const department of departmentData) {
      await tx.department.upsert({
        where: { id: department.id },
        update: { name: department.name, code: department.code, type: department.type, clinicId: CLINIC_ID },
        create: { ...department, clinicId: CLINIC_ID, sourceNode: DEMO_SOURCE_NODE },
      });
    }

    for (const service of serviceData) {
      await tx.service.upsert({
        where: { id: service.id },
        update: { name: service.name, category: service.category, isParamedical: service.isParamedical, clinicId: CLINIC_ID, active: true },
        create: { ...service, clinicId: CLINIC_ID, active: true, sourceNode: DEMO_SOURCE_NODE },
      });
    }

    if (profile === 'FULL') {
      for (const unit of serviceUnitData) {
        await tx.serviceUnit.upsert({
          where: { id: unit.id },
          update: { name: unit.name, departmentId: unit.departmentId, clinicId: CLINIC_ID, category: unit.category, active: true },
          create: { ...unit, clinicId: CLINIC_ID, active: true, sourceNode: DEMO_SOURCE_NODE },
        });
      }
    }

    for (const account of accounts) {
      if (!attendanceRoles.has(account.role)) continue;

      await tx.employee.upsert({
        where: { id: account.employeeId },
        update: {
          userId: account.id,
          clinicId: CLINIC_ID,
          firstName: account.firstName,
          lastName: account.lastName,
          position: account.label,
          departmentId: departmentIdByRole[account.role] ?? null,
          status: 'ACTIVE',
        },
        create: {
          id: account.employeeId,
          userId: account.id,
          clinicId: CLINIC_ID,
          employeeNumber: `DEMO-EMP-${account.username.replace('demo.', '').toUpperCase()}`,
          firstName: account.firstName,
          lastName: account.lastName,
          hireDate: new Date('2026-01-01T00:00:00.000Z'),
          position: account.label,
          departmentId: departmentIdByRole[account.role] ?? null,
          status: 'ACTIVE',
        },
      });
    }

    for (const patient of patientData) {
      await tx.patient.upsert({
        where: { id: patient.id },
        update: { firstName: patient.firstName, lastName: patient.lastName, gender: patient.gender, clinicId: CLINIC_ID },
        create: {
          ...patient,
          clinicId: CLINIC_ID,
          dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
          admissionType: 'PARTICULIER',
          priority: 'NORMAL',
          sourceNode: DEMO_SOURCE_NODE,
        },
      });
    }

    if (profile === 'FULL') {
    // Local examination catalogues. They are owned by this demonstration
    // clinic; no catalogue from another installation is read or changed.
    await tx.labSection.upsert({
      where: { id: fixtureIds.labSection },
      update: { clinicId: CLINIC_ID, name: 'Biochimie DEMO', active: true, order: 1 },
      create: { id: fixtureIds.labSection, clinicId: CLINIC_ID, name: 'Biochimie DEMO', active: true, order: 1 },
    });
    await tx.labCategory.upsert({
      where: { id: fixtureIds.labCategory },
      update: { clinicId: CLINIC_ID, sectionId: fixtureIds.labSection, name: 'Bilans usuels DEMO', code: 'DEMO-BIO', active: true, order: 1 },
      create: { id: fixtureIds.labCategory, clinicId: CLINIC_ID, sectionId: fixtureIds.labSection, name: 'Bilans usuels DEMO', code: 'DEMO-BIO', active: true, order: 1 },
    });
    await tx.labTest.upsert({
      where: { id: fixtureIds.labTest },
      update: { clinicId: CLINIC_ID, categoryId: fixtureIds.labCategory, sectionId: fixtureIds.labSection, code: 'DEMO-NFS', name: 'Numération formule sanguine – DEMO', price: '18000.00', active: true, createdById: accounts[7].id, updatedById: accounts[7].id },
      create: { id: fixtureIds.labTest, clinicId: CLINIC_ID, categoryId: fixtureIds.labCategory, sectionId: fixtureIds.labSection, code: 'DEMO-NFS', name: 'Numération formule sanguine – DEMO', price: '18000.00', active: true, createdById: accounts[7].id, updatedById: accounts[7].id },
    });
    await tx.imagingCatalogue.upsert({
      where: { id: fixtureIds.imagingCatalogue },
      update: { clinicId: CLINIC_ID, code: 'DEMO-RX-THORAX', name: 'Radiographie thoracique – DEMO', price: '50000.00', modality: ImagingModality.XRAY, active: true },
      create: { id: fixtureIds.imagingCatalogue, clinicId: CLINIC_ID, code: 'DEMO-RX-THORAX', name: 'Radiographie thoracique – DEMO', price: '50000.00', modality: ImagingModality.XRAY, active: true, sourceNode: DEMO_SOURCE_NODE },
    });
    await tx.imagingMachine.upsert({
      where: { id: fixtureIds.imagingMachine },
      update: { clinicId: CLINIC_ID, name: 'Salle RX DEMO', roomNumber: 'RX-DEMO-01', isOperational: true },
      create: { id: fixtureIds.imagingMachine, clinicId: CLINIC_ID, name: 'Salle RX DEMO', roomNumber: 'RX-DEMO-01', isOperational: true, sourceNode: DEMO_SOURCE_NODE },
    });

    // Medication is historically modelled as a shared catalogue. This record
    // exists only in the dedicated, sentinel-protected demo database and its
    // fixed identifiers are checked before every seed; it never alters a
    // pre-existing catalogue in another database.
    await tx.medicationSection.upsert({
      where: { id: fixtureIds.medicationSection },
      update: { name: 'Médicaments DEMO', code: 'DEMO-MED', active: true, sortOrder: 1 },
      create: { id: fixtureIds.medicationSection, name: 'Médicaments DEMO', code: 'DEMO-MED', active: true, sortOrder: 1 },
    });
    await tx.medicationCategory.upsert({
      where: { id: fixtureIds.medicationCategory },
      update: { sectionId: fixtureIds.medicationSection, name: 'Essentiels DEMO', code: 'DEMO-ESS', active: true, sortOrder: 1 },
      create: { id: fixtureIds.medicationCategory, sectionId: fixtureIds.medicationSection, name: 'Essentiels DEMO', code: 'DEMO-ESS', active: true, sortOrder: 1 },
    });
    await tx.medication.upsert({
      where: { id: fixtureIds.medication },
      update: { categoryId: fixtureIds.medicationCategory, code: 'DEMO-PARA-500', name: 'Paracétamol 500 mg – DEMO', unit: 'comprimé', strength: '500 mg', deletedAt: null, sourceNode: DEMO_SOURCE_NODE },
      create: { id: fixtureIds.medication, categoryId: fixtureIds.medicationCategory, code: 'DEMO-PARA-500', name: 'Paracétamol 500 mg – DEMO', unit: 'comprimé', strength: '500 mg', sourceNode: DEMO_SOURCE_NODE },
    });
    await tx.stockLot.upsert({
      where: { id: fixtureIds.stockLot },
      update: { medicationId: fixtureIds.medication, clinicId: CLINIC_ID, batchNumber: 'DEMO-LOT-001', quantity: 100, purchasePrice: '400.00', expiryDate: new Date('2030-12-31T00:00:00.000Z') },
      create: { id: fixtureIds.stockLot, medicationId: fixtureIds.medication, clinicId: CLINIC_ID, batchNumber: 'DEMO-LOT-001', quantity: 100, purchasePrice: '400.00', expiryDate: new Date('2030-12-31T00:00:00.000Z') },
    });
    await tx.medicationSalePrice.upsert({
      where: { clinicId_medicationId: { clinicId: CLINIC_ID, medicationId: fixtureIds.medication } },
      update: { amount: '1000.00', currency: 'CDF' },
      create: { id: fixtureIds.salePrice, clinicId: CLINIC_ID, medicationId: fixtureIds.medication, amount: '1000.00', currency: 'CDF' },
    });

    for (const [index, appointment] of appointments.entries()) {
      const consultation = consultations[index];
      await tx.appointment.upsert({
        where: { id: appointment.id },
        update: { patientId: appointment.patientId, clinicId: CLINIC_ID, requestedById: accounts[4].id, serviceUnitId: serviceUnitData[0].id, scheduledAt: appointment.scheduledAt, status: 'CHECKED_IN', reason: 'Parcours fictif de démonstration' },
        create: { ...appointment, clinicId: CLINIC_ID, requestedById: accounts[4].id, serviceUnitId: serviceUnitData[0].id, status: 'CHECKED_IN', reason: 'Parcours fictif de démonstration', sourceNode: DEMO_SOURCE_NODE },
      });
      await tx.consultation.upsert({
        where: { id: consultation.id },
        update: { patientId: consultation.patientId, appointmentId: consultation.appointmentId, clinicId: CLINIC_ID, providerId: accounts[6].id, status: index === 1 ? 'IN_PROGRESS' : 'FINALIZED', chiefComplaint: 'Symptômes fictifs de démonstration', clinicalSummary: 'Consultation de démonstration – aucune donnée réelle.', assessment: 'Évaluation clinique fictive.', plan: 'Suivi selon le parcours démontré.' },
        create: { ...consultation, clinicId: CLINIC_ID, providerId: accounts[6].id, status: index === 1 ? 'IN_PROGRESS' : 'FINALIZED', chiefComplaint: 'Symptômes fictifs de démonstration', clinicalSummary: 'Consultation de démonstration – aucune donnée réelle.', assessment: 'Évaluation clinique fictive.', plan: 'Suivi selon le parcours démontré.', sourceNode: DEMO_SOURCE_NODE },
      });
      await tx.patientVisit.upsert({
        where: { id: `85111111-1111-4111-8111-11111111111${index + 1}` },
        update: { patientId: appointment.patientId, appointmentId: appointment.id, receptionistId: accounts[4].id, clinicId: CLINIC_ID, serviceId: serviceData[0].id, visitType: 'DEMO', status: index === 2 ? 'AWAITING_PAYMENT' : index === 1 ? 'IN_CONSULTATION' : 'ORIENTED', reason: 'Visite fictive de démonstration' },
        create: { id: `85111111-1111-4111-8111-11111111111${index + 1}`, patientId: appointment.patientId, appointmentId: appointment.id, receptionistId: accounts[4].id, clinicId: CLINIC_ID, serviceId: serviceData[0].id, visitType: 'DEMO', status: index === 2 ? 'AWAITING_PAYMENT' : index === 1 ? 'IN_CONSULTATION' : 'ORIENTED', reason: 'Visite fictive de démonstration' },
      });
    }

    const patientWorkflow: PatientWorkflowStatus[] = [
      PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE,
      PatientWorkflowStatus.EN_CONSULTATION,
      PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
      PatientWorkflowStatus.EN_LABORATOIRE,
      PatientWorkflowStatus.EN_LABORATOIRE,
      PatientWorkflowStatus.EN_RADIOLOGIE,
      PatientWorkflowStatus.EN_PHARMACIE,
    ];
    for (const [index, patient] of patientData.entries()) {
      await tx.patient.update({
        where: { id: patient.id },
        data: { receptionistId: accounts[4].id, serviceId: serviceData[0].id, workflowStatus: patientWorkflow[index], arrivalAt: appointments[index].scheduledAt },
      });
    }

    // An incomplete but saved nursing triage demonstrates progressive capture;
    // another patient has all required vital types for the nurse's review.
    const vitalSigns = [
      { id: '86111111-1111-4111-8111-111111111111', patientId: patientData[0].id, type: VitalType.TEMPERATURE, value: '37.2', unit: '°C' },
      { id: '86111111-1111-4111-8111-111111111112', patientId: patientData[1].id, type: VitalType.TEMPERATURE, value: '36.9', unit: '°C' },
      { id: '86111111-1111-4111-8111-111111111113', patientId: patientData[1].id, type: VitalType.BLOOD_PRESSURE, value: '120/80', unit: 'mmHg' },
      { id: '86111111-1111-4111-8111-111111111114', patientId: patientData[1].id, type: VitalType.OXYGEN_SATURATION, value: '98', unit: '%' },
      { id: '86111111-1111-4111-8111-111111111115', patientId: patientData[1].id, type: VitalType.HEART_RATE, value: '76', unit: 'bpm' },
      { id: '86111111-1111-4111-8111-111111111116', patientId: patientData[1].id, type: VitalType.RESPIRATORY_RATE, value: '18', unit: '/min' },
      { id: '86111111-1111-4111-8111-111111111117', patientId: patientData[1].id, type: VitalType.WEIGHT, value: '68', unit: 'kg' },
      { id: '86111111-1111-4111-8111-111111111118', patientId: patientData[1].id, type: VitalType.HEIGHT, value: '170', unit: 'cm' },
    ];
    for (const vital of vitalSigns) {
      await tx.vitalSign.upsert({
        where: { id: vital.id },
        update: { patientId: vital.patientId, recordedById: accounts[5].id, type: vital.type, value: vital.value, unit: vital.unit },
        create: { ...vital, recordedById: accounts[5].id, sourceNode: DEMO_SOURCE_NODE },
      });
    }

    for (const invoice of invoices) {
      await tx.invoice.upsert({
        where: { id: invoice.id },
        update: { patientId: invoice.patientId, clinicId: CLINIC_ID, issuedById: accounts[3].id, type: invoice.type, status: invoice.status, totalAmount: invoice.total, balanceDue: invoice.balance, remarks: invoice.label },
        create: { id: invoice.id, patientId: invoice.patientId, clinicId: CLINIC_ID, issuedById: accounts[3].id, type: invoice.type, status: invoice.status, totalAmount: invoice.total, balanceDue: invoice.balance, remarks: invoice.label, sourceNode: DEMO_SOURCE_NODE },
      });
      await tx.invoiceLine.upsert({
        where: { id: `${invoice.id.slice(0, -1)}9` },
        update: { invoiceId: invoice.id, label: invoice.label, quantity: 1, unitPrice: invoice.total, totalAmount: invoice.total },
        create: { id: `${invoice.id.slice(0, -1)}9`, invoiceId: invoice.id, label: invoice.label, quantity: 1, unitPrice: invoice.total, totalAmount: invoice.total },
      });
    }
    for (const payment of payments) {
      await tx.payment.upsert({
        where: { id: payment.id },
        update: { invoiceId: payment.invoiceId, clinicId: CLINIC_ID, paidById: accounts[3].id, amount: payment.amount, method: PaymentMethod.CASH, reference: payment.reference, note: 'Paiement fictif de démonstration' },
        create: { ...payment, clinicId: CLINIC_ID, paidById: accounts[3].id, method: PaymentMethod.CASH, note: 'Paiement fictif de démonstration', sourceNode: DEMO_SOURCE_NODE },
      });
    }

    const labRequests = [
      { id: '87111111-1111-4111-8111-111111111111', patientId: patientData[3].id, consultationId: consultations[3].id, status: LabRequestStatus.REQUESTED, itemStatus: LabRequestItemStatus.REQUESTED, accession: 'DEMO-LAB-001' },
      { id: '87111111-1111-4111-8111-111111111112', patientId: patientData[4].id, consultationId: consultations[4].id, status: LabRequestStatus.AVAILABLE, itemStatus: LabRequestItemStatus.AVAILABLE, accession: 'DEMO-LAB-002' },
    ];
    for (const [index, request] of labRequests.entries()) {
      const itemId = `87211111-1111-4111-8111-11111111111${index + 1}`;
      await tx.labRequest.upsert({
        where: { id: request.id },
        update: { patientId: request.patientId, consultationId: request.consultationId, requestedById: accounts[6].id, clinicId: CLINIC_ID, status: request.status, accessionNumber: request.accession, notes: 'Demande fictive de démonstration' },
        create: { id: request.id, patientId: request.patientId, consultationId: request.consultationId, requestedById: accounts[6].id, clinicId: CLINIC_ID, status: request.status, accessionNumber: request.accession, notes: 'Demande fictive de démonstration', sourceNode: DEMO_SOURCE_NODE },
      });
      await tx.labRequestItem.upsert({
        where: { id: itemId },
        update: { labRequestId: request.id, labTestId: fixtureIds.labTest, status: request.itemStatus, assignedToId: accounts[7].id },
        create: { id: itemId, labRequestId: request.id, labTestId: fixtureIds.labTest, status: request.itemStatus, assignedToId: accounts[7].id, sourceNode: DEMO_SOURCE_NODE },
      });
      if (request.status === LabRequestStatus.AVAILABLE) {
        await tx.labResult.upsert({
          where: { id: '87311111-1111-4111-8111-111111111111' },
          update: { labRequestId: request.id, labRequestItemId: itemId, resultCode: 'DEMO-HB', resultName: 'Hémoglobine – DEMO', resultType: LabResultType.NUMERIC, resultStatus: LabResultValidationStatus.BIOLOGICALLY_VALIDATED, numericValue: '13.4', units: 'g/dL', referenceRange: '12.0–16.0', reportedById: accounts[7].id, biologicalValidatedById: accounts[7].id },
          create: { id: '87311111-1111-4111-8111-111111111111', labRequestId: request.id, labRequestItemId: itemId, resultCode: 'DEMO-HB', resultName: 'Hémoglobine – DEMO', resultType: LabResultType.NUMERIC, resultStatus: LabResultValidationStatus.BIOLOGICALLY_VALIDATED, numericValue: '13.4', units: 'g/dL', referenceRange: '12.0–16.0', reportedById: accounts[7].id, biologicalValidatedById: accounts[7].id, sourceNode: DEMO_SOURCE_NODE },
        });
      }
    }

    const imagingRequests = [
      { id: '88111111-1111-4111-8111-111111111111', patientId: patientData[5].id, consultationId: consultations[5].id, status: ImagingRequestStatus.REQUESTED, report: false },
      { id: '88111111-1111-4111-8111-111111111112', patientId: patientData[4].id, consultationId: consultations[4].id, status: ImagingRequestStatus.VERIFIED, report: true },
    ];
    for (const request of imagingRequests) {
      await tx.imagingRequest.upsert({
        where: { id: request.id },
        update: { patientId: request.patientId, consultationId: request.consultationId, clinicId: CLINIC_ID, requestedById: accounts[6].id, status: request.status, imagingCatalogueId: fixtureIds.imagingCatalogue, machineId: fixtureIds.imagingMachine, technicianId: accounts[8].id, bodyPart: 'Thorax', modality: ImagingModality.XRAY, clinicalIndication: 'Indication fictive de démonstration' },
        create: { id: request.id, patientId: request.patientId, consultationId: request.consultationId, clinicId: CLINIC_ID, requestedById: accounts[6].id, status: request.status, imagingCatalogueId: fixtureIds.imagingCatalogue, machineId: fixtureIds.imagingMachine, technicianId: accounts[8].id, bodyPart: 'Thorax', modality: ImagingModality.XRAY, clinicalIndication: 'Indication fictive de démonstration', sourceNode: DEMO_SOURCE_NODE },
      });
      if (request.report) {
        await tx.imagingReport.upsert({
          where: { imagingRequestId: request.id },
          update: { interpretedById: accounts[8].id, radiologistId: accounts[8].id, findings: 'Compte rendu fictif de démonstration.', impression: 'Aucune conclusion clinique réelle.', verified: true, verifiedAt: new Date('2026-10-06T10:00:00.000Z') },
          create: { imagingRequestId: request.id, interpretedById: accounts[8].id, radiologistId: accounts[8].id, findings: 'Compte rendu fictif de démonstration.', impression: 'Aucune conclusion clinique réelle.', verified: true, verifiedAt: new Date('2026-10-06T10:00:00.000Z'), sourceNode: DEMO_SOURCE_NODE },
        });
      }
    }

    const prescriptionId = '89111111-1111-4111-8111-111111111111';
    const prescriptionLineId = '89211111-1111-4111-8111-111111111111';
    await tx.prescription.upsert({
      where: { id: prescriptionId },
      update: { consultationId: consultations[6].id, patientId: patientData[6].id, prescriberId: accounts[6].id, clinicId: CLINIC_ID, status: PrescriptionStatus.PRESCRIBED, instruction: 'Ordonnance fictive prête à délivrer.' },
      create: { id: prescriptionId, consultationId: consultations[6].id, patientId: patientData[6].id, prescriberId: accounts[6].id, clinicId: CLINIC_ID, status: PrescriptionStatus.PRESCRIBED, instruction: 'Ordonnance fictive prête à délivrer.', sourceNode: DEMO_SOURCE_NODE },
    });
    await tx.prescriptionLine.upsert({
      where: { id: prescriptionLineId },
      update: { prescriptionId, medicationId: fixtureIds.medication, dosage: '500 mg', route: MedicationRoute.ORAL, frequency: MedicationFrequency.TID, quantity: 12, durationDays: 4, notes: 'Donnée fictive' },
      create: { id: prescriptionLineId, prescriptionId, medicationId: fixtureIds.medication, dosage: '500 mg', route: MedicationRoute.ORAL, frequency: MedicationFrequency.TID, quantity: 12, durationDays: 4, notes: 'Donnée fictive', sourceNode: DEMO_SOURCE_NODE },
    });
    await tx.invoice.update({ where: { id: invoices[3].id }, data: { prescriptionId, prescriptionVersion: 1 } });

    await tx.hospitalization.upsert({
      where: { id: '8a111111-1111-4111-8111-111111111111' },
      update: { patientId: patientData[1].id, clinicId: CLINIC_ID, serviceUnitId: serviceUnitData[0].id, physicianId: accounts[6].id, nurseInChargeId: accounts[5].id, status: 'ADMITTED', admissionReason: 'Observation fictive de démonstration' },
      create: { id: '8a111111-1111-4111-8111-111111111111', patientId: patientData[1].id, clinicId: CLINIC_ID, serviceUnitId: serviceUnitData[0].id, physicianId: accounts[6].id, nurseInChargeId: accounts[5].id, status: 'ADMITTED', admissionReason: 'Observation fictive de démonstration', sourceNode: DEMO_SOURCE_NODE },
    });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log(`Seed DEMO Core ${profile} terminé pour ${accounts.length} comptes et ${patientData.length} patients fictifs.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Échec du seed DEMO.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
