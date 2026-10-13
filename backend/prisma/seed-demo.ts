import {
  AuliaLayer,
  ClinicProvisioningStatus,
  DepartmentType,
  Prisma,
  PrismaClient,
  RoleSlug,
  ServiceCategory,
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

async function assertNoForeignData(tx: Prisma.TransactionClient) {
  const [clinic, user, employee, patient, department, service, role] = await Promise.all([
    tx.clinic.findFirst({ where: { id: { not: CLINIC_ID } }, select: { id: true } }),
    tx.user.findFirst({ where: { id: { notIn: accounts.map((account) => account.id) } }, select: { id: true } }),
    tx.employee.findFirst({ where: { id: { notIn: accounts.map((account) => account.employeeId) } }, select: { id: true } }),
    tx.patient.findFirst({ where: { id: { notIn: patientData.map((patient) => patient.id) } }, select: { id: true } }),
    tx.department.findFirst({ where: { id: { notIn: departmentData.map((department) => department.id) } }, select: { id: true } }),
    tx.service.findFirst({ where: { id: { notIn: serviceData.map((service) => service.id) } }, select: { id: true } }),
    tx.role.findFirst({ where: { id: { notIn: demoRoles.map((role) => roleIds[role]) } }, select: { id: true } }),
  ]);

  if (clinic || user || employee || patient || department || service || role) {
    throw new Error('Refus : des enregistrements étrangers à la démonstration sont présents dans cette base.');
  }
}

async function main() {
  requireDemoConfirmation('SEED_PUBLIC_CORE_DEMO');
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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log(`Seed DEMO Core terminé pour ${accounts.length} comptes et ${patientData.length} patients fictifs.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Échec du seed DEMO.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
