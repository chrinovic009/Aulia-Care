import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { runWithRequestContext } from '../../src/core/request-context';
import { PrismaService } from '../../src/prisma/prisma.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL RLS : un patient du portail ne lit que ses données, son équipe de soins et les catalogues', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const suffix = randomUUID().slice(0, 10);
  const birth = new Date('1980-01-01T00:00:00.000Z');
  const clinic = await prisma.clinic.create({ data: { name: `Moindre privilège ${suffix}` } });
  const staff = (role: 'PHYSICIAN' | 'NURSE' | 'FINANCE', tag: string) => prisma.user.create({ data: {
    clinicId: clinic.id, primaryRole: role, email: `${tag}-${suffix}@e2e.local`, username: `${tag}-${suffix}`,
    displayName: tag, firstName: tag, lastName: suffix, passwordHash: 'not-used' } });
  try {
    const [doctor, otherDoctor, finance] = await Promise.all([staff('PHYSICIAN', 'doc'), staff('PHYSICIAN', 'other'), staff('FINANCE', 'fin')]);
    const portalUser = await prisma.user.create({ data: { primaryRole: 'PATIENT', email: `pat-${suffix}@e2e.local`, username: `pat-${suffix}`, displayName: 'Patient', firstName: 'Patient', lastName: suffix, passwordHash: 'not-used' } });
    const [me, other] = await Promise.all([
      prisma.patient.create({ data: { clinicId: clinic.id, portalUserId: portalUser.id, firstName: 'Moi', lastName: suffix, gender: 'OTHER', dateOfBirth: birth } }),
      prisma.patient.create({ data: { clinicId: clinic.id, firstName: 'Autre', lastName: suffix, gender: 'OTHER', dateOfBirth: birth } }),
    ]);
    const service = await prisma.service.create({ data: { clinicId: clinic.id, name: `Consultation ${suffix}`, category: 'CONSULTATION' } as never });
    await prisma.chatMessage.create({ data: { clinicId: clinic.id, senderId: doctor.id, recipientId: portalUser.id, text: 'Bonjour' } });
    const staffChat = await prisma.chatMessage.create({ data: { clinicId: clinic.id, senderId: otherDoctor.id, recipientId: finance.id, text: 'Interne' } });
    const [myDevice, otherDevice] = await Promise.all([
      prisma.wearableDevice.create({ data: { patientId: me.id, manufacturer: 'OTHER', platform: 'OTHER', externalDeviceId: `me-${suffix}` } as never }),
      prisma.wearableDevice.create({ data: { patientId: other.id, manufacturer: 'OTHER', platform: 'OTHER', externalDeviceId: `ot-${suffix}` } as never }),
    ]);

    const asPatient = <T>(work: () => Promise<T>) => runWithRequestContext(
      { userId: portalUser.id, role: 'PATIENT', roles: ['PATIENT'], clinicId: null, patientId: me.id, patientClinicId: clinic.id, route: 'TEST' }, async () => await work());

    // Own clinical data and own devices only.
    assert.deepEqual((await asPatient(() => prisma.patient.findMany({ where: { lastName: suffix } }))).map((row) => row.id), [me.id]);
    assert.deepEqual((await asPatient(() => prisma.wearableDevice.findMany({ where: { id: { in: [myDevice.id, otherDevice.id] } } }))).map((row) => row.id), [myDevice.id]);
    // Staff accounts: only the care team (the doctor who wrote to them), never finance or other doctors.
    const visibleStaff = await asPatient(() => prisma.user.findMany({ where: { lastName: suffix }, select: { id: true } }));
    assert.deepEqual(visibleStaff.map((row) => row.id).sort(), [doctor.id, portalUser.id].sort());
    // Messages: only their own conversation.
    assert.equal(await asPatient(() => prisma.chatMessage.findUnique({ where: { id: staffChat.id } })), null);
    assert.equal(await asPatient(() => prisma.chatMessage.count({ where: { clinicId: clinic.id } })), 1);
    // Catalogue: readable. Staff-only tables: not.
    assert.equal((await asPatient(() => prisma.service.findUnique({ where: { id: service.id } })))?.id, service.id);
    assert.equal(await asPatient(() => prisma.hrPolicy.count({ where: { clinicId: clinic.id } })), 0);

    // Staff of the clinic keep their normal access.
    const asDoctor = <T>(work: () => Promise<T>) => runWithRequestContext({ userId: doctor.id, role: 'PHYSICIAN', roles: [], clinicId: clinic.id, route: 'TEST' }, async () => await work());
    assert.equal(await asDoctor(() => prisma.wearableDevice.count({ where: { id: { in: [myDevice.id, otherDevice.id] } } })), 2);
    assert.equal(await asDoctor(() => prisma.user.count({ where: { lastName: suffix, clinicId: clinic.id } })), 3);

    // Guard: no table holding establishment or patient data is left without isolation.
    assert.deepEqual(await prisma.$queryRaw`SELECT "table_name" FROM "aulia_unprotected_tenant_tables"()`, []);
  } finally {
    await prisma.wearableDevice.deleteMany({ where: { externalDeviceId: { endsWith: suffix } } }).catch(() => undefined);
    await prisma.chatMessage.deleteMany({ where: { clinicId: clinic.id } }).catch(() => undefined);
    await prisma.service.deleteMany({ where: { clinicId: clinic.id } }).catch(() => undefined);
    await prisma.patient.deleteMany({ where: { clinicId: clinic.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { lastName: suffix } }).catch(() => undefined);
    await prisma.clinic.delete({ where: { id: clinic.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});

test('PostgreSQL : une nouvelle table d’établissement sans isolation est détectée par la garde de démarrage', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaService();
  await prisma.$connect();
  const table = `e2e_unprotected_${randomUUID().slice(0, 8)}`;
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE "${table}" ("id" TEXT PRIMARY KEY, "clinicId" TEXT)`);
    await assert.rejects(() => prisma.assertTenantTablesProtected(), new RegExp(table));
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    await assert.rejects(() => prisma.assertTenantTablesProtected(), new RegExp(table));
    await prisma.$executeRawUnsafe(`CREATE POLICY "${table}_p" ON "${table}" USING ("aulia_clinic_reference_visible"("clinicId"))`);
    await prisma.assertTenantTablesProtected();
  } finally {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}"`);
    await prisma.$disconnect();
  }
});
