import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { BedStatus, DepartmentType, PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL: deux transactions ne peuvent pas réclamer le même lit', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = randomUUID().slice(0, 12);
  let clinicId: string | undefined;
  let departmentId: string | undefined;

  try {
    const clinic = await prisma.clinic.create({ data: { name: `Bed Race ${suffix}` } });
    clinicId = clinic.id;
    const department = await prisma.department.create({ data: { clinicId, name: `Hospitalisation ${suffix}`, code: `HOSP-${suffix}`, type: DepartmentType.MEDICAL } });
    departmentId = department.id;
    const unit = await prisma.serviceUnit.create({ data: { clinicId, departmentId: department.id, name: `Unité ${suffix}` } });
    const room = await prisma.room.create({ data: { serviceUnitId: unit.id, number: `RACE-${suffix}`, name: 'Chambre de test', location: 'Zone E2E' } });
    const bed = await prisma.bed.create({ data: { roomId: room.id, code: `LIT-${suffix}`, status: BedStatus.FREE } });
    const [patientOne, patientTwo] = await Promise.all([
      prisma.patient.create({ data: { clinicId, firstName: 'Patient', lastName: `Race A ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1990-01-01T00:00:00.000Z') } }),
      prisma.patient.create({ data: { clinicId, firstName: 'Patient', lastName: `Race B ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1991-01-01T00:00:00.000Z') } }),
    ]);
    const [hospitalizationOne, hospitalizationTwo] = await Promise.all([
      prisma.hospitalization.create({ data: { patientId: patientOne.id, serviceUnitId: unit.id, admissionReason: 'Test concurrence A' } }),
      prisma.hospitalization.create({ data: { patientId: patientTwo.id, serviceUnitId: unit.id, admissionReason: 'Test concurrence B' } }),
    ]);

    const claim = (hospitalizationId: string) => prisma.$transaction(async (tx) => {
      const update = await tx.bed.updateMany({
        where: { id: bed.id, status: BedStatus.FREE, hospitalizationId: null },
        data: { status: BedStatus.OCCUPIED, hospitalizationId },
      });
      if (update.count !== 1) throw new Error('BED_ALREADY_CLAIMED');
    });
    const results = await Promise.allSettled([claim(hospitalizationOne.id), claim(hospitalizationTwo.id)]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);

    const persisted = await prisma.bed.findUniqueOrThrow({ where: { id: bed.id } });
    assert.equal(persisted.status, BedStatus.OCCUPIED);
    assert.ok([hospitalizationOne.id, hospitalizationTwo.id].includes(persisted.hospitalizationId || ''));

    const released = await prisma.bed.updateMany({
      where: { id: bed.id, hospitalizationId: persisted.hospitalizationId, status: BedStatus.OCCUPIED },
      data: { status: BedStatus.FREE, hospitalizationId: null },
    });
    assert.equal(released.count, 1);
    const afterRelease = await prisma.bed.findUniqueOrThrow({ where: { id: bed.id } });
    assert.equal(afterRelease.status, BedStatus.FREE);
    assert.equal(afterRelease.hospitalizationId, null);
  } finally {
    if (clinicId) {
      await prisma.hospitalization.deleteMany({ where: { patient: { clinicId } } }).catch(() => undefined);
      await prisma.patient.deleteMany({ where: { clinicId } }).catch(() => undefined);
      await prisma.bed.deleteMany({ where: { room: { serviceUnit: { clinicId } } } }).catch(() => undefined);
      await prisma.room.deleteMany({ where: { serviceUnit: { clinicId } } }).catch(() => undefined);
      await prisma.serviceUnit.deleteMany({ where: { clinicId } }).catch(() => undefined);
    }
    if (departmentId) await prisma.department.delete({ where: { id: departmentId } }).catch(() => undefined);
    if (clinicId) await prisma.clinic.delete({ where: { id: clinicId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
