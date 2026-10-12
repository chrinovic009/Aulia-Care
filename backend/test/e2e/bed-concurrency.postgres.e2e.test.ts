import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  BedStatus,
  DepartmentType,
  PatientWorkflowStatus,
  PrismaClient,
  RoleSlug,
  ServiceCategory,
} from '@prisma/client';
import { HospitalizationsService } from '../../src/hospitalizations/hospitalizations.service';
import { BedAssignmentService } from '../../src/hospitalizations/bed-assignment.service';
import { PatientWorkflowService } from '../../src/core/patient-workflow.service';
import { ClinicContextService } from '../../src/core/clinic-context.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL: HospitalizationsService attribue un lit à un seul patient concurrent', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = randomUUID().slice(0, 12);
  let clinicId: string | undefined;

  try {
    const clinic = await prisma.clinic.create({ data: { name: `Bed Race ${suffix}` } });
    clinicId = clinic.id;
    const physician = await prisma.user.create({
      data: {
        clinicId,
        email: `bed-doctor-${suffix}@e2e.invalid`,
        username: `bed-doctor-${suffix}`,
        displayName: 'Médecin E2E',
        firstName: 'Médecin',
        lastName: 'E2E',
        passwordHash: 'not-a-real-password',
        primaryRole: RoleSlug.PHYSICIAN,
      },
    });
    const department = await prisma.department.create({
      data: { clinicId, name: `Hospitalisation ${suffix}`, code: `HOSP-${suffix}`, type: DepartmentType.MEDICAL },
    });
    const unit = await prisma.serviceUnit.create({
      data: { clinicId, departmentId: department.id, name: `Unité ${suffix}`, category: ServiceCategory.OTHER_CLINICAL },
    });
    const room = await prisma.room.create({
      data: { serviceUnitId: unit.id, number: `RACE-${suffix}`, name: 'Chambre de test', location: 'Zone E2E' },
    });
    const bed = await prisma.bed.create({ data: { roomId: room.id, code: `LIT-${suffix}`, status: BedStatus.FREE } });
    const [patientOne, patientTwo] = await Promise.all([
      prisma.patient.create({ data: { clinicId, firstName: 'Patient', lastName: `Race A ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), workflowStatus: PatientWorkflowStatus.EN_ATTENTE_MEDECIN } }),
      prisma.patient.create({ data: { clinicId, firstName: 'Patient', lastName: `Race B ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1991-01-01T00:00:00.000Z'), workflowStatus: PatientWorkflowStatus.EN_ATTENTE_MEDECIN } }),
    ]);
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
    const [appointmentOne, appointmentTwo] = await Promise.all([
      prisma.appointment.create({ data: { clinicId, patientId: patientOne.id, requestedById: physician.id, scheduledAt, durationMinutes: 30 } }),
      prisma.appointment.create({ data: { clinicId, patientId: patientTwo.id, requestedById: physician.id, scheduledAt, durationMinutes: 30 } }),
    ]);
    const [consultationOne, consultationTwo] = await Promise.all([
      prisma.consultation.create({ data: { clinicId, patientId: patientOne.id, providerId: physician.id, appointmentId: appointmentOne.id } }),
      prisma.consultation.create({ data: { clinicId, patientId: patientTwo.id, providerId: physician.id, appointmentId: appointmentTwo.id } }),
    ]);

    const hospitalizations = new HospitalizationsService(
      prisma as unknown as PrismaService,
      { createAndEmit: async () => undefined } as any,
      new ClinicContextService(prisma as unknown as PrismaService),
      { nurseCapacity: async () => 1 } as any,
      new BedAssignmentService(),
      new PatientWorkflowService(),
    );
    const admit = (patientId: string, consultationId: string) => hospitalizations.create({
      patientId,
      consultationId,
      serviceUnitId: unit.id,
      bedId: bed.id,
      admissionReason: 'Test de concurrence E2E',
    }, physician.id);

    const results = await Promise.allSettled([
      admit(patientOne.id, consultationOne.id),
      admit(patientTwo.id, consultationTwo.id),
    ]);
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
      results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => String(result.reason?.message || result.reason))
        .join(' | '),
    );
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);

    const persisted = await prisma.bed.findUniqueOrThrow({ where: { id: bed.id } });
    assert.equal(persisted.status, BedStatus.OCCUPIED);
    assert.ok(persisted.hospitalizationId);
    assert.equal(await prisma.hospitalization.count({ where: { patient: { clinicId } } }), 1);
  } finally {
    if (clinicId) {
      await prisma.medicalHistory.deleteMany({ where: { patient: { clinicId } } }).catch(() => undefined);
      await prisma.consultation.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.hospitalization.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.appointment.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.patient.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.bed.deleteMany({ where: { room: { serviceUnit: { clinicId } } } }).catch(() => undefined);
      await prisma.room.deleteMany({ where: { serviceUnit: { clinicId } } }).catch(() => undefined);
      await prisma.serviceUnit.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.department.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.clinic.delete({ where: { id: clinicId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
});
