import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  AuliaLayer,
  AppointmentStatus,
  ClinicProvisioningStatus,
  ConsultationStatus,
  DepartmentType,
  EmployeeStatus,
  EncounterType,
  InvoiceStatus,
  InvoiceType,
  LabRequestItemStatus,
  LabRequestStatus,
  LabResultType,
  LabResultValidationStatus,
  MedicationFrequency,
  MedicationRoute,
  PatientVisitStatus,
  PatientWorkflowStatus,
  Prisma,
  PrismaClient,
  PrescriptionStatus,
  RoleSlug,
  ServiceCategory,
  UserStatus,
  VitalType,
} from '@prisma/client';
import {
  assertDemoDatabaseConnection,
  resolveDemoDatabaseTarget,
} from '../src/core/app-mode';

const DEMO_CLINIC_NAME = 'Aulia Care Demonstration Center';
const DEMO_EMAIL_DOMAIN = 'demo.aulia.invalid';
const DEMO_MARKER = 'AULIA_DEMO_SEED_V1';
const DEMO_CLINIC_FOOTER = 'AULIA_DEMO_SEED_V1 | Fictional data only | Do not use for care.';
const DEMO_DEPARTMENT_NAME = 'DEMO General Medicine Department';
const DEMO_SERVICE_UNIT_NAME = 'DEMO General Consultation';
const DEMO_SERVICE_NAME = 'DEMO Core Consultation';
const DEMO_LAB_SECTION_NAME = 'DEMO Hematology';
const DEMO_LAB_CATEGORY_NAME = 'DEMO Hematology';
const DEMO_LAB_TEST_NAME = 'DEMO Complete Blood Count';
const DEMO_MEDICATION_SECTION_NAME = 'DEMO Medications';
const DEMO_MEDICATION_CATEGORY_NAME = 'DEMO Analgesics';
const DEMO_MEDICATION_NAME = 'DEMO Paracetamol 500 mg';

type DemoUserKey =
  | 'superAdmin'
  | 'admin'
  | 'finance'
  | 'reception'
  | 'nurse'
  | 'doctor'
  | 'lab'
  | 'radiology'
  | 'pharmacy'
  | 'cashier';
type DemoPrisma = PrismaClient | Prisma.TransactionClient;

export const DEMO_USERS: ReadonlyArray<{
  key: DemoUserKey;
  username: string;
  role: RoleSlug;
  firstName: string;
  lastName: string;
  position: string;
}> = [
  { key: 'superAdmin', username: 'demo.super-admin', role: RoleSlug.SUPER_ADMIN, firstName: 'SuperAdmin', lastName: 'Demo', position: 'Demo super administrator' },
  { key: 'admin', username: 'demo.admin', role: RoleSlug.ADMIN, firstName: 'Admin', lastName: 'Demo', position: 'Administrator' },
  { key: 'finance', username: 'demo.finance', role: RoleSlug.FINANCE, firstName: 'Finance', lastName: 'Demo', position: 'Finance officer' },
  { key: 'reception', username: 'demo.reception', role: RoleSlug.RECEPTIONIST, firstName: 'Reception', lastName: 'Demo', position: 'Receptionist' },
  { key: 'nurse', username: 'demo.nurse', role: RoleSlug.NURSE, firstName: 'Nursing', lastName: 'Demo', position: 'Demo nurse' },
  { key: 'doctor', username: 'demo.doctor', role: RoleSlug.PHYSICIAN, firstName: 'Clinical', lastName: 'Demo', position: 'Demo physician' },
  { key: 'lab', username: 'demo.lab', role: RoleSlug.LAB_TECHNICIAN, firstName: 'Laboratory', lastName: 'Demo', position: 'Laboratory technician' },
  { key: 'radiology', username: 'demo.radiology', role: RoleSlug.RADIOLOGIST, firstName: 'Radiology', lastName: 'Demo', position: 'Radiology technician' },
  { key: 'pharmacy', username: 'demo.pharmacy', role: RoleSlug.PHARMACIST, firstName: 'Pharmacy', lastName: 'Demo', position: 'Demo pharmacist' },
  { key: 'cashier', username: 'demo.cashier', role: RoleSlug.CASHIER, firstName: 'Cashier', lastName: 'Demo', position: 'Demo cashier' },
];

export const DEMO_PATIENTS: ReadonlyArray<{
  externalId: string;
  workflowStatus: PatientWorkflowStatus;
  label: string;
}> = [
  { externalId: 'DEMO-PAT-001', workflowStatus: PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT, label: 'Fictional new admission' },
  { externalId: 'DEMO-PAT-002', workflowStatus: PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE, label: 'Fictional nursing queue' },
  { externalId: 'DEMO-PAT-003', workflowStatus: PatientWorkflowStatus.EN_ATTENTE_MEDECIN, label: 'Fictional physician queue' },
  { externalId: 'DEMO-PAT-004', workflowStatus: PatientWorkflowStatus.EN_CONSULTATION, label: 'Fictional consultation in progress' },
  { externalId: 'DEMO-PAT-005', workflowStatus: PatientWorkflowStatus.EN_LABORATOIRE, label: 'Fictional laboratory workflow' },
  { externalId: 'DEMO-PAT-006', workflowStatus: PatientWorkflowStatus.EN_PHARMACIE, label: 'Fictional pharmacy workflow' },
  { externalId: 'DEMO-PAT-007', workflowStatus: PatientWorkflowStatus.TERMINE, label: 'Fictional completed workflow' },
];

export type DemoSeedEnvironment = Partial<Pick<NodeJS.ProcessEnv,
  | 'AULIA_APP_MODE'
  | 'AULIA_DEMO_SEED_CONFIRM'
  | 'AULIA_DEMO_PASSWORD'
  | 'DATABASE_URL'
  | 'AULIA_DEMO_DATABASE_NAME'
  | 'AULIA_DEMO_DATABASE_USER'
  | 'AULIA_DEMO_DATABASE_SENTINEL'>>;

/**
 * This inventory is deliberately independent from a database connection so
 * the fail-closed policy can be tested without PostgreSQL.  Roles and global
 * catalogues are not included: an empty DEMO database may legitimately have
 * immutable reference data installed by migrations or a platform bootstrap.
 */
export type DemoSeedBusinessInventory = Readonly<Record<
  'clinics' | 'users' | 'employees' | 'patients' | 'departments' | 'services'
  | 'serviceUnits' | 'appointments' | 'consultations' | 'labRequests'
  | 'prescriptions' | 'invoices' | 'payments' | 'hospitalizations',
  number
>>;

export function assertDemoSeedBusinessInventoryIsEmpty(
  inventory: DemoSeedBusinessInventory,
): void {
  const populated = Object.entries(inventory)
    .filter(([, count]) => count > 0)
    .map(([name]) => name);
  if (populated.length) {
    throw new Error(
      'Seed DEMO refused: first execution requires an empty isolated database; '
      + 'pre-existing business data found in ' + populated.join(', ') + '.',
    );
  }
}

export function validateDemoSeedEnvironment(
  environment: DemoSeedEnvironment,
): { password: string; databaseName: string } {
  if (environment.AULIA_APP_MODE !== 'demo') {
    throw new Error('Seed DEMO refused: AULIA_APP_MODE=demo is required.');
  }
  if (environment.AULIA_DEMO_SEED_CONFIRM !== 'true') {
    throw new Error('Seed DEMO refused: AULIA_DEMO_SEED_CONFIRM=true is required.');
  }
  const password = String(environment.AULIA_DEMO_PASSWORD || '');
  if (password.length < 16) {
    throw new Error('Seed DEMO refused: AULIA_DEMO_PASSWORD must contain at least 16 characters.');
  }
  const target = resolveDemoDatabaseTarget(environment);
  return { password, databaseName: target.databaseName };
}

export async function assertDemoSeedPreflight(prisma: DemoPrisma): Promise<void> {
  const [clinics, unexpectedUser, unexpectedPatient, inventory] = await Promise.all([
    prisma.clinic.findMany({
      select: { id: true, name: true, documentFooter: true },
      take: 2,
    }),
    prisma.user.findFirst({
      where: { username: { notIn: DEMO_USERS.map((user) => user.username) } },
      select: { id: true },
    }),
    prisma.patient.findFirst({
      where: { externalId: { notIn: DEMO_PATIENTS.map((patient) => patient.externalId) } },
      select: { id: true },
    }),
    Promise.all([
      prisma.clinic.count(),
      prisma.user.count(),
      prisma.employee.count(),
      prisma.patient.count(),
      prisma.department.count(),
      prisma.service.count(),
      prisma.serviceUnit.count(),
      prisma.appointment.count(),
      prisma.consultation.count(),
      prisma.labRequest.count(),
      prisma.prescription.count(),
      prisma.invoice.count(),
      prisma.payment.count(),
      prisma.hospitalization.count(),
    ]),
  ]);

  if (clinics.length === 0) {
    const [
      clinicCount, userCount, employeeCount, patientCount, departmentCount,
      serviceCount, serviceUnitCount, appointmentCount, consultationCount,
      labRequestCount, prescriptionCount, invoiceCount, paymentCount,
      hospitalizationCount,
    ] = inventory;
    assertDemoSeedBusinessInventoryIsEmpty({
      clinics: clinicCount,
      users: userCount,
      employees: employeeCount,
      patients: patientCount,
      departments: departmentCount,
      services: serviceCount,
      serviceUnits: serviceUnitCount,
      appointments: appointmentCount,
      consultations: consultationCount,
      labRequests: labRequestCount,
      prescriptions: prescriptionCount,
      invoices: invoiceCount,
      payments: paymentCount,
      hospitalizations: hospitalizationCount,
    });
    return;
  }

  // A clinic name, user name or database name is never proof of provenance.
  // A subsequent run is accepted only after the first run has written the
  // explicit marker and all identities remain inside the deterministic fixture.
  if (
    clinics.length !== 1
    || clinics[0].name !== DEMO_CLINIC_NAME
    || clinics[0].documentFooter !== DEMO_CLINIC_FOOTER
  ) {
    throw new Error('Seed DEMO refused: the target database is not an identified DEMO fixture.');
  }
  if (unexpectedUser) {
    throw new Error('Seed DEMO refused: the target database already contains a non-DEMO user.');
  }
  if (unexpectedPatient) {
    throw new Error('Seed DEMO refused: the target database already contains a non-DEMO patient.');
  }
}

async function ensureDemoUser(
  prisma: DemoPrisma,
  clinicId: string,
  passwordHash: string,
  spec: (typeof DEMO_USERS)[number],
): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { username: spec.username },
    select: { id: true, clinicId: true },
  });
  if (existing && existing.clinicId !== clinicId) {
    throw new Error('Seed DEMO refused: ' + spec.username + ' belongs to another clinic.');
  }
  const role = await prisma.role.findUnique({
    where: { slug: spec.role },
    select: { id: true },
  });
  if (!role) {
    throw new Error(
      'Seed DEMO refused: required canonical role ' + spec.role + ' is missing. Provision reference data before seeding the isolated DEMO database.',
    );
  }
  const user = await prisma.user.upsert({
    where: { username: spec.username },
    update: {
      email: spec.username + '@' + DEMO_EMAIL_DOMAIN,
      displayName: spec.firstName + ' ' + spec.lastName,
      firstName: spec.firstName,
      lastName: spec.lastName,
      passwordHash,
      primaryRole: spec.role,
      clinicId,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    create: {
      email: spec.username + '@' + DEMO_EMAIL_DOMAIN,
      username: spec.username,
      displayName: spec.firstName + ' ' + spec.lastName,
      firstName: spec.firstName,
      lastName: spec.lastName,
      passwordHash,
      primaryRole: spec.role,
      clinicId,
      status: UserStatus.ACTIVE,
    },
    select: { id: true },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: { active: true },
    create: { userId: user.id, roleId: role.id, active: true },
  });
  const employees = await prisma.employee.findMany({
    where: { userId: user.id },
    select: { id: true, clinicId: true },
    take: 2,
  });
  if (employees.some((employee) => employee.clinicId !== clinicId)) {
    throw new Error('Seed DEMO refused: employee record belongs to another clinic.');
  }
  const employeeData = {
    userId: user.id,
    clinicId,
    employeeNumber: 'DEMO-EMP-' + spec.key.toUpperCase(),
    firstName: spec.firstName,
    lastName: spec.lastName,
    position: spec.position,
    status: EmployeeStatus.ACTIVE,
    hireDate: new Date('2026-01-01T08:00:00.000Z'),
  };
  if (employees[0]) {
    await prisma.employee.update({ where: { id: employees[0].id }, data: employeeData });
  } else {
    await prisma.employee.create({ data: employeeData });
  }
  return user.id;
}

async function ensureDemoAppointment(
  prisma: DemoPrisma,
  patientId: string,
  clinicId: string,
  doctorId: string,
  serviceUnitId: string,
  marker: string,
) {
  const existing = await prisma.appointment.findFirst({
    where: { patientId, clinicId, reason: marker, deletedAt: null },
    select: { id: true },
  });
  return existing || prisma.appointment.create({
    data: {
      patientId,
      clinicId,
      requestedById: doctorId,
      serviceUnitId,
      scheduledAt: new Date('2026-03-10T09:00:00.000Z'),
      durationMinutes: 30,
      reason: marker,
      status: AppointmentStatus.CHECKED_IN,
    },
    select: { id: true },
  });
}

async function ensureMedicationCatalogue(prisma: DemoPrisma) {
  const section = await prisma.medicationSection.findUnique({
    where: { code: 'DEMO-MED' },
  }) || await prisma.medicationSection.create({
    data: { code: 'DEMO-MED', name: DEMO_MEDICATION_SECTION_NAME, active: true },
  });
  if (section.name !== DEMO_MEDICATION_SECTION_NAME) {
    throw new Error('Seed DEMO refused: DEMO medication section collides with another catalogue.');
  }
  const category = await prisma.medicationCategory.findUnique({
    where: { sectionId_code: { sectionId: section.id, code: 'DEMO-ANALGESIC' } },
  }) || await prisma.medicationCategory.create({
    data: { sectionId: section.id, code: 'DEMO-ANALGESIC', name: DEMO_MEDICATION_CATEGORY_NAME, active: true },
  });
  if (category.name !== DEMO_MEDICATION_CATEGORY_NAME) {
    throw new Error('Seed DEMO refused: DEMO medication category collides with another catalogue.');
  }
  const medication = await prisma.medication.findUnique({
    where: { code: 'DEMO-PARACETAMOL-500' },
  }) || await prisma.medication.create({
    data: {
      code: 'DEMO-PARACETAMOL-500',
      name: DEMO_MEDICATION_NAME,
      unit: 'tablet',
      strength: '500 mg',
      categoryId: category.id,
    },
  });
  if (medication.name !== DEMO_MEDICATION_NAME || medication.categoryId !== category.id) {
    throw new Error('Seed DEMO refused: DEMO medication collides with another catalogue.');
  }
  return medication;
}

export async function runDemoSeed(
  client: PrismaClient,
  environment: DemoSeedEnvironment,
): Promise<{ clinicId: string; users: number; patients: number }> {
  const validation = validateDemoSeedEnvironment(environment);
  await assertDemoDatabaseConnection(client, resolveDemoDatabaseTarget(environment));
  const passwordHash = await bcrypt.hash(validation.password, 12);

  return client.$transaction(async (prisma) => {
    await assertDemoSeedPreflight(prisma);
    const clinic = await prisma.clinic.findFirst({
      where: { name: DEMO_CLINIC_NAME, deletedAt: null },
      select: { id: true },
    }) || await prisma.clinic.create({
      data: {
        name: DEMO_CLINIC_NAME,
        legalName: DEMO_CLINIC_NAME,
        brandDisplayName: 'Aulia Care Core DEMO',
        establishmentType: 'MEDICAL_CENTER',
        provisioningStatus: ClinicProvisioningStatus.ACTIVE,
        country: 'Democratic Republic of the Congo',
        city: 'Lubumbashi',
        province: 'Haut-Katanga',
        address: 'Fictional address - DEMO environment',
        email: 'contact@' + DEMO_EMAIL_DOMAIN,
        phone: '+243000000000',
        timezone: 'Africa/Lubumbashi',
        currency: 'CDF',
        status: 'ACTIVE',
        documentFooter: DEMO_CLINIC_FOOTER,
      },
      select: { id: true },
    });
    await prisma.clinic.update({
      where: { id: clinic.id },
      data: {
        provisioningStatus: ClinicProvisioningStatus.ACTIVE,
        status: 'ACTIVE',
        timezone: 'Africa/Lubumbashi',
        currency: 'CDF',
      },
    });
    await prisma.platformLayerConfiguration.upsert({
      where: { clinicId: clinic.id },
      update: { enabledLayers: [AuliaLayer.CORE], configuredAt: new Date() },
      create: { clinicId: clinic.id, enabledLayers: [AuliaLayer.CORE], configuredAt: new Date() },
    });

    const userIds = {} as Record<DemoUserKey, string>;
    for (const spec of DEMO_USERS) {
      userIds[spec.key] = await ensureDemoUser(prisma, clinic.id, passwordHash, spec);
    }

    const existingDepartment = await prisma.department.findUnique({
      where: { clinicId_name: { clinicId: clinic.id, name: DEMO_DEPARTMENT_NAME } },
      select: { clinicId: true },
    });
    if (existingDepartment && existingDepartment.clinicId !== clinic.id) {
      throw new Error('Seed DEMO refused: DEMO department belongs to another clinic.');
    }
    const department = await prisma.department.upsert({
      where: { clinicId_name: { clinicId: clinic.id, name: DEMO_DEPARTMENT_NAME } },
      update: { clinicId: clinic.id, type: DepartmentType.MEDICAL, code: 'DEMO-MED', deletedAt: null },
      create: { name: DEMO_DEPARTMENT_NAME, code: 'DEMO-MED', type: DepartmentType.MEDICAL, clinicId: clinic.id },
      select: { id: true },
    });
    const serviceUnit = await prisma.serviceUnit.upsert({
      where: { departmentId_name: { departmentId: department.id, name: DEMO_SERVICE_UNIT_NAME } },
      update: { clinicId: clinic.id, category: ServiceCategory.CONSULTATION, active: true, deletedAt: null, location: 'DEMO clinical zone' },
      create: { departmentId: department.id, clinicId: clinic.id, name: DEMO_SERVICE_UNIT_NAME, category: ServiceCategory.CONSULTATION, location: 'DEMO clinical zone', active: true },
      select: { id: true },
    });
    const existingService = await prisma.service.findUnique({
      where: { clinicId_name: { clinicId: clinic.id, name: DEMO_SERVICE_NAME } },
      select: { clinicId: true },
    });
    if (existingService && existingService.clinicId !== clinic.id) {
      throw new Error('Seed DEMO refused: DEMO service belongs to another clinic.');
    }
    const service = await prisma.service.upsert({
      where: { clinicId_name: { clinicId: clinic.id, name: DEMO_SERVICE_NAME } },
      update: { clinicId: clinic.id, category: ServiceCategory.CONSULTATION, active: true, isParamedical: false },
      create: { name: DEMO_SERVICE_NAME, clinicId: clinic.id, category: ServiceCategory.CONSULTATION, active: true, isParamedical: false },
      select: { id: true },
    });

    const patientIds: Record<string, string> = {};
    for (const [index, spec] of DEMO_PATIENTS.entries()) {
      const existingPatient = await prisma.patient.findUnique({
        where: { externalId: spec.externalId },
        select: { clinicId: true },
      });
      if (existingPatient && existingPatient.clinicId !== clinic.id) {
        throw new Error('Seed DEMO refused: ' + spec.externalId + ' belongs to another clinic.');
      }
      const patient = await prisma.patient.upsert({
        where: { externalId: spec.externalId },
        update: {
          clinicId: clinic.id,
          receptionistId: userIds.reception,
          serviceId: service.id,
          workflowStatus: spec.workflowStatus,
          status: 'ACTIVE',
          deletedAt: null,
        },
        create: {
          externalId: spec.externalId,
          firstName: 'DemoPatient' + String(index + 1).padStart(2, '0'),
          lastName: 'Fictional',
          gender: index % 2 === 0 ? 'F' : 'M',
          dateOfBirth: new Date('199' + index + '-01-15T00:00:00.000Z'),
          email: 'patient' + String(index + 1).padStart(2, '0') + '@' + DEMO_EMAIL_DOMAIN,
          phone: '+2430000000' + String(index + 1).padStart(2, '0'),
          address: 'Fictional DEMO address',
          city: 'Lubumbashi',
          profession: 'Fictional demonstration profile',
          clinicId: clinic.id,
          receptionistId: userIds.reception,
          serviceId: service.id,
          workflowStatus: spec.workflowStatus,
          arrivalAt: new Date('2026-03-10T08:00:00.000Z'),
        },
        select: { id: true },
      });
      patientIds[spec.externalId] = patient.id;
      const history = await prisma.medicalHistory.findFirst({
        where: { patientId: patient.id, kind: 'DEMO_SEED_STATUS', deletedAt: null },
        select: { id: true },
      });
      const historyData = {
        eventDate: new Date('2026-03-10T08:00:00.000Z'),
        details: JSON.stringify({ marker: DEMO_MARKER, label: spec.label, fictional: true }),
        createdById: userIds.reception,
      };
      if (history) await prisma.medicalHistory.update({ where: { id: history.id }, data: historyData });
      else await prisma.medicalHistory.create({ data: { patientId: patient.id, kind: 'DEMO_SEED_STATUS', ...historyData } });
    }

    const visitPatientId = patientIds['DEMO-PAT-001'];
    const visit = await prisma.patientVisit.findFirst({
      where: { patientId: visitPatientId, clinicId: clinic.id, visitType: DEMO_MARKER },
      select: { id: true },
    });
    const visitData = {
      receptionistId: userIds.reception,
      clinicId: clinic.id,
      serviceId: service.id,
      visitType: DEMO_MARKER,
      reason: 'Fictional DEMO admission',
      status: PatientVisitStatus.AWAITING_PAYMENT,
      metadata: { fictional: true, marker: DEMO_MARKER },
    };
    if (visit) await prisma.patientVisit.update({ where: { id: visit.id }, data: visitData });
    else await prisma.patientVisit.create({ data: { patientId: visitPatientId, ...visitData } });

    const vitalsPatientId = patientIds['DEMO-PAT-002'];
    const vital = await prisma.vitalSign.findFirst({
      where: { patientId: vitalsPatientId, recordedById: userIds.nurse, type: VitalType.TEMPERATURE, note: DEMO_MARKER, deletedAt: null },
      select: { id: true },
    });
    const vitalData = {
      recordedById: userIds.nurse,
      type: VitalType.TEMPERATURE,
      value: '36.8',
      unit: 'C',
      note: DEMO_MARKER,
    };
    if (vital) await prisma.vitalSign.update({ where: { id: vital.id }, data: vitalData });
    else await prisma.vitalSign.create({ data: { patientId: vitalsPatientId, ...vitalData } });

    const labPatientId = patientIds['DEMO-PAT-005'];
    const labAppointment = await ensureDemoAppointment(
      prisma, labPatientId, clinic.id, userIds.doctor, serviceUnit.id, DEMO_MARKER + ':LAB',
    );
    const labConsultation = await prisma.consultation.upsert({
      where: { appointmentId: labAppointment.id },
      update: { clinicId: clinic.id, providerId: userIds.doctor, status: ConsultationStatus.IN_PROGRESS, chiefComplaint: 'Fictional laboratory workflow' },
      create: { patientId: labPatientId, appointmentId: labAppointment.id, clinicId: clinic.id, providerId: userIds.doctor, status: ConsultationStatus.IN_PROGRESS, encounterType: EncounterType.OUTPATIENT, chiefComplaint: 'Fictional laboratory workflow' },
      select: { id: true },
    });
    const labSection = await prisma.labSection.upsert({
      where: { clinicId_name: { clinicId: clinic.id, name: DEMO_LAB_SECTION_NAME } },
      update: { active: true },
      create: { clinicId: clinic.id, name: DEMO_LAB_SECTION_NAME, active: true },
    });
    const labCategory = await prisma.labCategory.upsert({
      where: { clinicId_code: { clinicId: clinic.id, code: 'DEMO-HEM' } },
      update: { sectionId: labSection.id, name: DEMO_LAB_CATEGORY_NAME, active: true },
      create: { clinicId: clinic.id, code: 'DEMO-HEM', name: DEMO_LAB_CATEGORY_NAME, sectionId: labSection.id, active: true },
    });
    const labTest = await prisma.labTest.upsert({
      where: { clinicId_code: { clinicId: clinic.id, code: 'DEMO-NFS' } },
      update: { name: DEMO_LAB_TEST_NAME, categoryId: labCategory.id, sectionId: labSection.id, price: 15000, active: true },
      create: { clinicId: clinic.id, code: 'DEMO-NFS', name: DEMO_LAB_TEST_NAME, categoryId: labCategory.id, sectionId: labSection.id, price: 15000, resultType: LabResultType.NUMERIC, unit: 'g/dL', referenceRange: '12-16', active: true },
    });
    const labRequest = await prisma.labRequest.findFirst({
      where: { patientId: labPatientId, clinicId: clinic.id, externalReference: DEMO_MARKER + ':LAB', deletedAt: null },
      select: { id: true },
    }) || await prisma.labRequest.create({
      data: { consultationId: labConsultation.id, patientId: labPatientId, requestedById: userIds.doctor, clinicId: clinic.id, status: LabRequestStatus.COMPLETED, externalReference: DEMO_MARKER + ':LAB', specimenType: 'Fictional blood specimen', notes: 'Fictional DEMO laboratory result.' },
      select: { id: true },
    });
    const labItem = await prisma.labRequestItem.findFirst({
      where: { labRequestId: labRequest.id, labTestId: labTest.id, deletedAt: null },
      select: { id: true },
    }) || await prisma.labRequestItem.create({
      data: { labRequestId: labRequest.id, labTestId: labTest.id, assignedToId: userIds.lab, status: LabRequestItemStatus.AVAILABLE },
      select: { id: true },
    });
    const result = await prisma.labResult.findFirst({
      where: { labRequestId: labRequest.id, resultCode: 'DEMO-HGB', deletedAt: null },
      select: { id: true },
    });
    const resultData = {
      labRequestItemId: labItem.id,
      resultCode: 'DEMO-HGB',
      resultName: 'Fictional hemoglobin',
      resultType: LabResultType.NUMERIC,
      resultStatus: LabResultValidationStatus.BIOLOGICALLY_VALIDATED,
      numericValue: 13.4,
      units: 'g/dL',
      referenceRange: '12-16',
      reportedById: userIds.lab,
      technicalValidatedById: userIds.lab,
      biologicalValidatedById: userIds.lab,
      comments: 'Fictional DEMO data.',
    };
    if (result) await prisma.labResult.update({ where: { id: result.id }, data: resultData });
    else await prisma.labResult.create({ data: { labRequestId: labRequest.id, ...resultData } });

    const pharmacyPatientId = patientIds['DEMO-PAT-006'];
    const pharmacyAppointment = await ensureDemoAppointment(
      prisma, pharmacyPatientId, clinic.id, userIds.doctor, serviceUnit.id, DEMO_MARKER + ':PHARMACY',
    );
    const pharmacyConsultation = await prisma.consultation.upsert({
      where: { appointmentId: pharmacyAppointment.id },
      update: { clinicId: clinic.id, providerId: userIds.doctor, status: ConsultationStatus.IN_PROGRESS, chiefComplaint: 'Fictional prescription workflow' },
      create: { patientId: pharmacyPatientId, appointmentId: pharmacyAppointment.id, clinicId: clinic.id, providerId: userIds.doctor, status: ConsultationStatus.IN_PROGRESS, encounterType: EncounterType.OUTPATIENT, chiefComplaint: 'Fictional prescription workflow' },
      select: { id: true },
    });
    const medication = await ensureMedicationCatalogue(prisma);
    const stock = await prisma.stockLot.findFirst({
      where: { medicationId: medication.id, clinicId: clinic.id, batchNumber: 'DEMO-BATCH-001' },
      select: { id: true },
    });
    if (stock) {
      await prisma.stockLot.update({
        where: { id: stock.id },
        data: { quantity: 100, purchasePrice: 500, expiryDate: new Date('2030-12-31T00:00:00.000Z') },
      });
    } else {
      await prisma.stockLot.create({
        data: { medicationId: medication.id, clinicId: clinic.id, batchNumber: 'DEMO-BATCH-001', quantity: 100, purchasePrice: 500, expiryDate: new Date('2030-12-31T00:00:00.000Z') },
      });
    }
    const prescription = await prisma.prescription.findFirst({
      where: { consultationId: pharmacyConsultation.id, instruction: DEMO_MARKER + ':PHARMACY', deletedAt: null },
      select: { id: true },
    }) || await prisma.prescription.create({
      data: { consultationId: pharmacyConsultation.id, patientId: pharmacyPatientId, prescriberId: userIds.doctor, clinicId: clinic.id, status: PrescriptionStatus.PRESCRIBED, instruction: DEMO_MARKER + ':PHARMACY' },
      select: { id: true },
    });
    const prescriptionLine = await prisma.prescriptionLine.findFirst({
      where: { prescriptionId: prescription.id, medicationId: medication.id, deletedAt: null },
      select: { id: true },
    });
    if (!prescriptionLine) {
      await prisma.prescriptionLine.create({
        data: { prescriptionId: prescription.id, medicationId: medication.id, dosage: '500 mg', route: MedicationRoute.ORAL, frequency: MedicationFrequency.BID, quantity: 6, durationDays: 3, notes: 'Fictional DEMO prescription.' },
      });
    }

    const completePatientId = patientIds['DEMO-PAT-007'];
    const invoice = await prisma.invoice.findFirst({
      where: { patientId: completePatientId, clinicId: clinic.id, remarks: DEMO_MARKER + ':COMPLETE', deletedAt: null },
      select: { id: true },
    }) || await prisma.invoice.create({
      data: { patientId: completePatientId, issuedById: userIds.cashier, clinicId: clinic.id, type: InvoiceType.SERVICE, status: InvoiceStatus.PAID, totalAmount: 10000, balanceDue: 0, remarks: DEMO_MARKER + ':COMPLETE' },
      select: { id: true },
    });
    const payment = await prisma.payment.findFirst({
      where: { invoiceId: invoice.id, clinicId: clinic.id, reference: DEMO_MARKER + ':PAYMENT', deletedAt: null },
      select: { id: true },
    });
    if (!payment) {
      await prisma.payment.create({
        data: { invoiceId: invoice.id, clinicId: clinic.id, paidById: userIds.cashier, amount: 10000, method: 'CASH', reference: DEMO_MARKER + ':PAYMENT', note: 'Fictional DEMO payment.' },
      });
    }

    return { clinicId: clinic.id, users: DEMO_USERS.length, patients: DEMO_PATIENTS.length };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 30_000,
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await runDemoSeed(prisma, process.env);
    console.log('DEMO seed complete - clinic=' + result.clinicId + '; users=' + result.users + '; patients=' + result.patients + '.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
