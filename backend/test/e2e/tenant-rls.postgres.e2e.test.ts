import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { runWithRequestContext } from '../../src/core/request-context';
import { PrismaService } from '../../src/prisma/prisma.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL RLS : un code qui oublie le filtre d’établissement ne voit et ne modifie que son établissement', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  // The test connects as a superuser on purpose: isolation must hold anyway,
  // because request transactions switch to the restricted aulia_app role.
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const suffix = randomUUID().slice(0, 10);
  const clinicIds: string[] = [];
  const birth = new Date('1975-03-03T00:00:00.000Z');

  try {
    const [clinicA, clinicB] = await Promise.all([
      prisma.clinic.create({ data: { name: `RLS A ${suffix}` } }),
      prisma.clinic.create({ data: { name: `RLS B ${suffix}` } }),
    ]);
    clinicIds.push(clinicA.id, clinicB.id);
    const doctorA = await prisma.user.create({
      data: {
        clinicId: clinicA.id, primaryRole: 'PHYSICIAN', email: `rls-a-${suffix}@e2e.local`, username: `rls-a-${suffix}`,
        displayName: 'RLS A', firstName: 'RLS', lastName: 'A', passwordHash: 'not-used',
      },
    });
    const [patientA, patientB] = await Promise.all([
      prisma.patient.create({ data: { clinicId: clinicA.id, firstName: 'Patient', lastName: `RLS-A-${suffix}`, gender: 'OTHER', dateOfBirth: birth } }),
      prisma.patient.create({ data: { clinicId: clinicB.id, firstName: 'Patient', lastName: `RLS-B-${suffix}`, gender: 'OTHER', dateOfBirth: birth } }),
    ]);
    const asDoctorA = <T>(work: () => Promise<T>) =>
      runWithRequestContext({ userId: doctorA.id, clinicId: clinicA.id, role: 'PHYSICIAN', route: 'TEST' }, async () => await work());
    const sameSuffix = { lastName: { contains: suffix } };

    // A query without any clinic filter only returns the request's establishment.
    const visible = await asDoctorA(() => prisma.patient.findMany({ where: sameSuffix }));
    assert.deepEqual(visible.map((patient) => patient.id), [patientA.id]);
    assert.equal(await asDoctorA(() => prisma.patient.findUnique({ where: { id: patientB.id } })), null);
    assert.equal(await asDoctorA(() => prisma.patient.count({ where: sameSuffix })), 1);

    // Inside an explicit service transaction too.
    const inTransaction = await asDoctorA(() => prisma.$transaction((tx) => tx.patient.findMany({ where: sameSuffix })));
    assert.deepEqual(inTransaction.map((patient) => patient.id), [patientA.id]);

    // Another establishment's row can be neither changed nor created.
    const changed = await asDoctorA(() => prisma.patient.updateMany({ where: { id: patientB.id }, data: { city: 'Falsifié' } }));
    assert.equal(changed.count, 0);
    await assert.rejects(() => asDoctorA(() => prisma.patient.create({
      data: { clinicId: clinicB.id, firstName: 'Intrus', lastName: `RLS-X-${suffix}`, gender: 'OTHER', dateOfBirth: birth },
    })));
    assert.equal((await prisma.patient.findUniqueOrThrow({ where: { id: patientB.id } })).city, null);

    // Own establishment: normal reads and writes keep working.
    const updated = await asDoctorA(() => prisma.patient.update({ where: { id: patientA.id }, data: { city: 'Kolwezi' } }));
    assert.equal(updated.city, 'Kolwezi');

    // Outside an authenticated request (login, background jobs), no filter applies.
    assert.equal(await prisma.patient.count({ where: sameSuffix }), 2);
  } finally {
    if (clinicIds.length) {
      const where = { clinicId: { in: clinicIds } };
      await prisma.patient.deleteMany({ where }).catch(() => undefined);
      await prisma.user.deleteMany({ where }).catch(() => undefined);
      await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
});
