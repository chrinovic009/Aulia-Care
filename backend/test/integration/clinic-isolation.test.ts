import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient, ConsultationStatus } from '@prisma/client';
import { ConsultationsService } from '../../src/consultations/consultations.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('un médecin ne peut pas lire les consultations d’un autre établissement', { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = randomUUID().slice(0, 8);
  const ids: string[] = [];
  try {
    const [clinicA, clinicB] = await Promise.all([
      prisma.clinic.create({ data: { name: `Test Clinic A ${suffix}` } }),
      prisma.clinic.create({ data: { name: `Test Clinic B ${suffix}` } }),
    ]);
    ids.push(clinicA.id, clinicB.id);
    const [doctorA, doctorB] = await Promise.all([
      prisma.user.create({ data: { email: `doctor-a-${suffix}@test.local`, username: `doctor-a-${suffix}`, displayName: 'Docteur A', firstName: 'Docteur', lastName: 'A', passwordHash: 'not-used', primaryRole: 'PHYSICIAN', clinicId: clinicA.id } }),
      prisma.user.create({ data: { email: `doctor-b-${suffix}@test.local`, username: `doctor-b-${suffix}`, displayName: 'Docteur B', firstName: 'Docteur', lastName: 'B', passwordHash: 'not-used', primaryRole: 'PHYSICIAN', clinicId: clinicB.id } }),
    ]);
    const [patientA, patientB] = await Promise.all([
      prisma.patient.create({ data: { firstName: 'Patient', lastName: `A ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1990-01-01'), clinicId: clinicA.id } }),
      prisma.patient.create({ data: { firstName: 'Patient', lastName: `B ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1990-01-01'), clinicId: clinicB.id } }),
    ]);
    const [appointmentA, appointmentB] = await Promise.all([
      prisma.appointment.create({ data: { patientId: patientA.id, clinicId: clinicA.id, requestedById: doctorA.id, scheduledAt: new Date(), durationMinutes: 30, reason: 'Test', status: 'CHECKED_IN' } }),
      prisma.appointment.create({ data: { patientId: patientB.id, clinicId: clinicB.id, requestedById: doctorB.id, scheduledAt: new Date(), durationMinutes: 30, reason: 'Test', status: 'CHECKED_IN' } }),
    ]);
    const [consultationA, consultationB] = await Promise.all([
      prisma.consultation.create({ data: { patientId: patientA.id, appointmentId: appointmentA.id, clinicId: clinicA.id, providerId: doctorA.id, status: ConsultationStatus.IN_PROGRESS } }),
      prisma.consultation.create({ data: { patientId: patientB.id, appointmentId: appointmentB.id, clinicId: clinicB.id, providerId: doctorB.id, status: ConsultationStatus.IN_PROGRESS } }),
    ]);
    const service = new ConsultationsService(prisma as never, { notify: () => undefined } as never);
    const visible = await service.findAll(doctorA.id, 'PHYSICIAN');
    assert.deepEqual(visible.map((item) => item.id), [consultationA.id]);
    await assert.rejects(() => service.findOne(consultationB.id, doctorA.id, 'PHYSICIAN'));
  } finally {
    // CI uses a disposable database. The cleanup also makes local TEST_DATABASE_URL runs safe.
    await prisma.consultation.deleteMany({ where: { clinicId: { in: ids } } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { clinicId: { in: ids } } }).catch(() => undefined);
    await prisma.patient.deleteMany({ where: { clinicId: { in: ids } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { clinicId: { in: ids } } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
