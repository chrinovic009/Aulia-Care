import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { runWithRequestContext } from '../../src/core/request-context';
import { PrismaService } from '../../src/prisma/prisma.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

type Verify = { checked: bigint; firstInvalidId: bigint | null };

test('PostgreSQL : registre d’audit attribué, sans secrets, en ajout seul et chaîné', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const suffix = randomUUID().slice(0, 10);
  const clinicIds: string[] = [];
  const verify = async (clinicId: string) =>
    (await prisma.$queryRaw<Verify[]>`SELECT * FROM "audit_ledger_verify"(${clinicId})`)[0];
  const ledger = (entityId: string) => prisma.auditLedger.findMany({ where: { entityId }, orderBy: { id: 'asc' } });

  try {
    const clinic = await prisma.clinic.create({ data: { name: `Audit ${suffix}` } });
    const tampered = await prisma.clinic.create({ data: { name: `Audit tamper ${suffix}` } });
    clinicIds.push(clinic.id, tampered.id);
    const doctor = await prisma.user.create({
      data: {
        clinicId: clinic.id, primaryRole: 'PHYSICIAN', email: `audit-doc-${suffix}@e2e.local`, username: `audit-doc-${suffix}`,
        displayName: 'Audit', firstName: 'Audit', lastName: 'Doc', passwordHash: 'secret-hash-must-not-leak', pinHash: 'pin-hash',
      },
    });
    const context = { userId: doctor.id, clinicId: clinic.id, role: 'PHYSICIAN', route: 'PATCH /patients/:id' };

    // 1. A write outside any transaction is attributed to the request author.
    const patient = await runWithRequestContext(context, async () => await prisma.patient.create({
      data: { clinicId: clinic.id, firstName: 'Patient', lastName: `Audit ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1980-01-01T00:00:00.000Z') },
    }));
    // A Prisma query runs when awaited: it must be awaited inside the request context,
    // exactly as an API handler does.
    const [created] = await ledger(patient.id);
    assert.equal(created.action, 'INSERT');
    assert.equal(created.entity, 'Patient');
    assert.equal(created.actorId, doctor.id);
    assert.equal(created.actorRole, 'PHYSICIAN');
    assert.equal(created.clinicId, clinic.id);
    assert.equal((created.data as { after: { lastName: string } }).after.lastName, `Audit ${suffix}`);
    assert.deepEqual(created.context, { route: 'PATCH /patients/:id', roles: [] });

    // 2. An update records only what changed, inside an interactive transaction too.
    await runWithRequestContext(context, async () => await prisma.$transaction((tx) =>
      tx.patient.update({ where: { id: patient.id }, data: { phone: '+243810000001' } })));
    const updates = (await ledger(patient.id)).filter((row) => row.action === 'UPDATE');
    assert.equal(updates.length, 1);
    assert.deepEqual((updates[0].data as { changes: Record<string, unknown> }).changes, { phone: [null, '+243810000001'] });
    assert.equal(updates[0].actorId, doctor.id);

    // 3. Secrets never reach the ledger.
    const [userRow] = await ledger(doctor.id);
    const userAfter = (userRow.data as { after: Record<string, unknown> }).after;
    assert.ok(!('passwordHash' in userAfter));
    assert.ok(!('pinHash' in userAfter));
    assert.equal(userAfter.username, `audit-doc-${suffix}`);

    // 4. A change made by a background job (no request) is still recorded, without author.
    await prisma.patient.update({ where: { id: patient.id }, data: { city: 'Lubumbashi' } });
    const systemRow = (await ledger(patient.id)).at(-1)!;
    assert.equal(systemRow.actorId, null);
    assert.equal(systemRow.clinicId, clinic.id);

    // 5. The ledger refuses any rewrite.
    await assert.rejects(() => prisma.$executeRaw`UPDATE "AuditLedger" SET "actorId" = NULL WHERE "id" = ${created.id}`);
    await assert.rejects(() => prisma.$executeRaw`DELETE FROM "AuditLedger" WHERE "id" = ${created.id}`);
    await assert.rejects(() => prisma.$executeRawUnsafe('TRUNCATE "AuditLedger"'));

    // 6. Concurrent writes keep one intact chain per establishment.
    await Promise.all(Array.from({ length: 8 }, (_, index) => runWithRequestContext(context, async () =>
      await prisma.patient.update({ where: { id: patient.id }, data: { address: `Adresse ${index}` } }))));
    const intact = await verify(clinic.id);
    assert.equal(intact.firstInvalidId, null);
    assert.ok(Number(intact.checked) >= 10);

    // 7. Tampering is detected at the first altered row.
    const victim = await prisma.patient.create({
      data: { clinicId: tampered.id, firstName: 'Patient', lastName: `Tamper ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1990-01-01T00:00:00.000Z') },
    });
    await prisma.patient.update({ where: { id: victim.id }, data: { phone: '+243820000002' } });
    const [firstVictimRow] = await ledger(victim.id);
    assert.equal((await verify(tampered.id)).firstInvalidId, null);
    await prisma.$executeRawUnsafe('ALTER TABLE "AuditLedger" DISABLE TRIGGER "AuditLedger_insert_only"');
    try {
      await prisma.$executeRaw`UPDATE "AuditLedger" SET "data" = '{"after":{"lastName":"Falsifié"}}'::jsonb WHERE "id" = ${firstVictimRow.id}`;
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "AuditLedger" ENABLE TRIGGER "AuditLedger_insert_only"');
    }
    assert.equal((await verify(tampered.id)).firstInvalidId, firstVictimRow.id);
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
